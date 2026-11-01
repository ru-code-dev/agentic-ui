import { UiKitProvider } from "@agentic-ui/ui-kit-one-react";
import { useEffect, useMemo, useState } from "react";
import type { ErrorSource } from "./channel.ts";
import { captureConsoleErrors } from "./console-capture.ts";
import { ErrorBanner } from "./error-banner.tsx";
import { decodeMessagesHash } from "./hash.ts";
import { RenderBoundary } from "./render-boundary.tsx";
import { RuntimeSurfaces } from "./runtime-surfaces.tsx";
import { useChannel } from "./use-channel.ts";
import { usePreviewRuntime } from "./use-preview-runtime.ts";
import { newId } from "../lib/new-id.ts";

/**
 * `/preview`: a document of its own where the kit owns the page (document mode). Shown in the
 * device frame's iframe and in "open in new tab"; driven by the preview channel or the URL hash.
 */
export function PreviewPage() {
  const previewId = useMemo(() => newId(), []);
  const [state, setState] = useState<{
    messages: readonly unknown[] | undefined;
    revision: number;
  }>({ messages: undefined, revision: 0 });
  const [errors, setErrors] = useState<readonly string[]>([]);

  const post = useChannel((message) => {
    if (message.type === "render") {
      setErrors([]);
      setState({ messages: message.messages, revision: message.revision });
    }
    if (message.type === "reply") apply(message.messages);
    if (message.type === "applyDataModel") {
      apply([
        {
          version: "v0.9",
          updateDataModel: { surfaceId: message.surfaceId, path: "/", value: message.value },
        },
      ]);
    }
  });

  const report = (source: ErrorSource, message: string) => {
    if (source !== "console")
      setErrors((previous) => (previous.includes(message) ? previous : [...previous, message]));
    post({ type: "error", previewId, source, message });
  };

  const { runtime, apply } = usePreviewRuntime(state.messages, state.revision, {
    onAction: (action, dataModel) => post({ type: "action", previewId, ...action, dataModel }),
    onDataModel: (surfaceId, value) => post({ type: "dataModel", previewId, surfaceId, value }),
    onError: report,
    onRendered: (revision) => post({ type: "rendered", previewId, revision }),
  });

  useEffect(() => {
    // The returned function is the cleanup on purpose: it restores console.error.
    return captureConsoleErrors((message) =>
      post({ type: "error", previewId, source: "console", message }),
    );
  }, [post, previewId]);

  useEffect(() => {
    // A4-17: a broken share link (not base64, not deflate, truncated, not JSON) is reported on the page
    // and to the opener; "hello" is posted either way, so the opener can still drive the preview.
    void decodeMessagesHash(location.hash)
      .then((fromHash) => {
        if (fromHash !== undefined) setState({ messages: fromHash, revision: 0 });
      })
      .catch((failure: unknown) => {
        const reason = failure instanceof Error ? failure.message : String(failure);
        const message = `Ссылка на превью повреждена: ${reason}`;
        setErrors((previous) => (previous.includes(message) ? previous : [...previous, message]));
        post({ type: "error", previewId, source: "runtime", message });
      })
      .finally(() => post({ type: "hello", previewId }));
  }, [post, previewId]);

  return (
    <UiKitProvider mode="document">
      <ErrorBanner errors={errors} />
      <div data-testid="preview-root">
        <RenderBoundary key={state.revision} onError={(message) => report("render", message)}>
          {runtime === undefined ? null : <RuntimeSurfaces runtime={runtime} />}
        </RenderBoundary>
      </div>
    </UiKitProvider>
  );
}
