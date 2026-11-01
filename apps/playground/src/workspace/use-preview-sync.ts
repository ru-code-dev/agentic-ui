import { useCallback, useEffect, useRef } from "react";
import { useChannel } from "../preview/use-channel.ts";
import { useSession } from "../state/session-store.ts";
import { useWorkspace } from "../state/workspace-store.ts";
import { matchingReplies } from "./mock-replies.ts";

const surfaceOf = (messages: readonly unknown[]) =>
  JSON.stringify(messages).match(/"surfaceId":"([^"]+)"/)?.[1] ?? "";

/**
 * The app side of the preview channel (PG-24): renders the last valid messages in every preview,
 * logs actions, answers them with matching mock rules, and collects data models and errors.
 * Messages of preview tabs from another build are ignored and flagged (PG-28).
 */
export function usePreviewSync(messages: readonly unknown[] | undefined) {
  const lastValid = useRef<readonly unknown[]>([]);
  const session = useSession.getState;

  const post = useChannel((message) => {
    switch (message.type) {
      case "hello":
        post({ type: "render", messages: lastValid.current, revision: session().revision });
        return;
      case "action": {
        const { name, surfaceId, context, dataModel, timestamp } = message;
        session().logEvent({
          time: timestamp,
          kind: "action",
          surfaceId,
          name,
          context,
          dataModel,
        });
        for (const reply of matchingReplies(useWorkspace.getState().mockRules, name)) {
          post({ type: "reply", messages: reply.messages });
          session().logEvent({
            time: new Date().toISOString(),
            kind: "reply",
            surfaceId: surfaceOf(reply.messages),
            name: `${name} → ${reply.rule.id}`,
            context: undefined,
            dataModel: undefined,
          });
        }
        return;
      }
      case "dataModel":
        session().setDataModel(message.surfaceId, message.value);
        return;
      case "error":
        session().reportError(message.source, message.message);
        return;
      case "rendered":
        session().markRendered(message.revision);
        return;
      default:
        return;
    }
  }, session().noteOtherBuild);

  const render = useCallback(
    (next: readonly unknown[]) => {
      lastValid.current = next;
      session().clearPreviewErrors();
      post({ type: "render", messages: next, revision: session().bumpRevision() });
    },
    [post, session],
  );

  useEffect(() => {
    if (messages !== undefined) render(messages);
  }, [messages, render]);

  return {
    /** Ctrl/Cmd+Enter: render the last valid messages again from a clean state (PG-17). */
    forceRender: () => render(lastValid.current),
    applyDataModel: (surfaceId: string, value: unknown) =>
      post({ type: "applyDataModel", surfaceId, value }),
  };
}
