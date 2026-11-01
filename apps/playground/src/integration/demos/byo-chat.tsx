import {
  A2UIKitProvider,
  A2UISurface,
  useA2UISurfaces,
  type SurfaceAction,
} from "@agentic-ui/a2ui-react";
import { extractA2UI } from "@agentic-ui/a2ui-react/core";
import { useEffect, useState } from "react";
import type { DemoProps } from "../demo-props.ts";

interface Message {
  readonly id: number;
  readonly from: "user" | "host";
  readonly text: string;
  /** Surfaces this reply created (shown under it). */
  readonly created: readonly string[];
}

/**
 * Bring your own chat: the host keeps its own messages and its own LLM call (`connection.llm` here). Only
 * replies with an `<a2ui-json>` block get UI: `extractA2UI` splits the reply, `useA2UISurfaces().apply`
 * checks and renders it. Surface actions go to the host's `onAction`; this host answers them locally.
 */
export function ByoChatDemo({ connection, showSurfaces }: DemoProps) {
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const say = (from: Message["from"], line: string, created: readonly string[] = []) =>
    setMessages((all) => [...all, { id: all.length + 1, from, text: line, created }]);
  const onAction = (action: SurfaceAction) => {
    say("host", `Хост получил действие ${action.name}: ${JSON.stringify(action.dataModel)}`);
    apply([
      {
        version: "v0.9",
        updateDataModel: { surfaceId: action.surfaceId, path: "/status", value: "Принято хостом" },
      },
    ]);
  };
  const { surfaces, apply } = useA2UISurfaces({ onAction });
  useEffect(() => {
    showSurfaces(surfaces); // playground only: the Data model tab
  }, [surfaces, showSurfaces]);
  const ask = async (question: string) => {
    say("user", question);
    setBusy(true);
    try {
      const reply = extractA2UI(await connection.llm(question));
      const result = reply.messages.length === 0 ? undefined : apply(reply.messages);
      say("host", reply.text, result?.valid ? result.created : []);
      if (result?.valid === false) say("host", `Интерфейс не показан: ${result.errors.join("; ")}`);
    } catch (failure) {
      say("host", `Ошибка: ${failure instanceof Error ? failure.message : String(failure)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      {messages.map((message) => (
        <div key={message.id} data-testid="byo-message" data-from={message.from}>
          <p
            className={`max-w-[85%] rounded-lg px-3 py-1.5 text-[13px] whitespace-pre-wrap ${
              message.from === "user" ? "ml-auto bg-brand/20" : "bg-white/[0.06]"
            }`}
          >
            {message.text}
          </p>
          {message.created.length === 0 ? null : (
            <A2UIKitProvider mode="scoped">
              {surfaces
                .filter((surface) => message.created.includes(surface.id))
                .map((surface) => (
                  <A2UISurface key={surface.id} surface={surface} />
                ))}
            </A2UIKitProvider>
          )}
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim() === "" || busy) return;
          void ask(text.trim());
          setText("");
        }}
      >
        <input
          aria-label="Сообщение хосту"
          className="flex-1 rounded border bg-transparent px-2 py-1 text-[13px]"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button
          type="submit"
          className="rounded-md border px-2.5 py-1 text-[12.5px] hover:bg-white/[0.06] disabled:opacity-50"
          disabled={busy}
        >
          Отправить хосту
        </button>
      </form>
    </div>
  );
}
