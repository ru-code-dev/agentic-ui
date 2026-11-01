import { A2UIKitProvider, A2UISurface, type UseA2UIChat } from "@agentic-ui/a2ui-react";
import { MessagesSquare, TriangleAlert } from "lucide-react";
import { RenderBoundary } from "../preview/render-boundary.tsx";
import { EmptyHint } from "../workspace/panels/empty-hint.tsx";
import { agentLog } from "./agent-chat.ts";

const failed = (message: string) => (
  <div
    role="alert"
    data-testid="render-failed"
    className="rounded-md border border-destructive/40 bg-destructive/[0.07] p-3 text-[13px]"
  >
    Интерфейс не удалось отрисовать: <span className="font-mono">{message}</span>
  </div>
);

/**
 * The agent's surfaces, rendered by the package (`<A2UISurface>` in the scoped kit provider, DEC-001), in
 * creation order and updated in place by surfaceId. A render error goes to the banner and asks the agent
 * for one repair (DEC-063); a surface that throws as a whole leaves a placeholder, never a white page (A3-13).
 */
export function AgentPreview({ chat }: { chat: UseA2UIChat }) {
  const errors = agentLog.useLog((state) => state.runtimeErrors);
  const report = (message: string) => {
    agentLog.error(message);
    chat.chat.reportRenderError(message);
  };
  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-(--kit-page-bg)">
      {errors.length === 0 ? null : (
        <div className="flex items-center gap-2 border-b bg-destructive/10 px-3 py-1.5 text-[12px] text-destructive-foreground">
          <TriangleAlert className="size-3.5" />
          {errors.join("; ")}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-4" data-testid="agent-preview">
        {chat.surfaces.length === 0 ? null : (
          <RenderBoundary key={chat.chatId} onError={report} fallback={failed}>
            <A2UIKitProvider mode="scoped">
              <div className="flex flex-col gap-4">
                {chat.surfaces.map((surface) => (
                  <A2UISurface
                    key={surface.id}
                    surface={surface}
                    onError={report}
                    fallback={failed}
                  />
                ))}
              </div>
            </A2UIKitProvider>
          </RenderBoundary>
        )}
      </div>
      {chat.surfaces.length > 0 ? null : (
        <div className="absolute inset-0 bg-background">
          <EmptyHint
            icon={MessagesSquare}
            title="Здесь появится интерфейс"
            hint="Вставьте данные слева, напишите, что показать, и отправьте: агент вернёт проверенный интерфейс."
          />
        </div>
      )}
    </div>
  );
}
