import { UiKitProvider } from "@agentic-ui/ui-kit-one-react";
import { RuntimeSurfaces } from "../preview/runtime-surfaces.tsx";
import { useStaticRuntime } from "../preview/use-static-runtime.ts";

/** A snippet rendered in-document with the scoped kit provider (DEC-001). */
export function SnippetPreview({
  messages,
  testId,
}: {
  messages: readonly unknown[];
  testId?: string;
}) {
  const runtime = useStaticRuntime(messages);
  return (
    <div data-testid={testId}>
      <UiKitProvider mode="scoped">
        {runtime === undefined ? null : <RuntimeSurfaces runtime={runtime} />}
      </UiKitProvider>
    </div>
  );
}
