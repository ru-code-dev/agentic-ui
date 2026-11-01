import { UiKitProvider } from "@agentic-ui/ui-kit-one-react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import type { ChatTurn } from "../core/chat-state.ts";
import { A2UISurface } from "./a2ui-surface.tsx";
import { Composer, TurnView, WorkingView, type ChatSlots } from "./chat-parts.tsx";
import { DEFAULT_LABELS, type ChatLabels } from "./labels.ts";
import type { Surface } from "./renderer.ts";
import type { UseA2UIChat } from "./use-a2ui-chat.ts";

/**
 * Where surfaces appear: `anchored` under the turn that created them (updated there in place), `follow`
 * under the latest turn that created or updated them, `panel` in one panel next to the transcript.
 */
export type Placement = "anchored" | "follow" | "panel";

export interface A2UIChatProps extends ChatSlots {
  /** The chat (`useA2UIChat(...)`): the host keeps it for its own panels (events, data model). */
  readonly chat: UseA2UIChat;
  readonly placement?: Placement;
  /** `latest`: only the surfaces the latest UI turn created or updated take input; older ones are inert. */
  readonly interactive?: "all" | "latest";
  readonly labels?: Partial<ChatLabels>;
  /** The kit provider around the surfaces (the host's own one, REMAP kit swap); default: scoped ui-kit-one. */
  readonly provider?: ComponentType<{ readonly children: ReactNode }>;
}

function ScopedKit({ children }: { readonly children: ReactNode }) {
  return <UiKitProvider mode="scoped">{children}</UiKitProvider>;
}

const touched = (turn: ChatTurn) => [
  ...(turn.result?.created ?? []),
  ...(turn.result?.updated ?? []),
];

/** The turn each surface is shown under (undefined: the panel, or no turn names it). */
function anchors(turns: readonly ChatTurn[], placement: Placement): Map<string, number> {
  const at = new Map<string, number>();
  if (placement === "panel") return at;
  for (const turn of turns)
    for (const id of placement === "anchored" ? (turn.result?.created ?? []) : touched(turn))
      at.set(id, turn.id);
  return at;
}

/** SV-C26: the default chat — transcript, surfaces per placement, working state, composer, model choice. */
export function A2UIChat({
  chat,
  placement = "anchored",
  interactive = "all",
  labels: overrides,
  provider: Provider = ScopedKit,
  ...slots
}: A2UIChatProps) {
  const labels = { ...DEFAULT_LABELS, ...overrides };
  const at = anchors(chat.turns, placement);
  const lastUi = chat.turns.findLast((turn) => touched(turn).length > 0);
  const latest = new Set(lastUi === undefined ? [] : touched(lastUi));
  const last = chat.turns.at(-1);
  const view = (surface: Surface) => {
    const live = interactive === "all" || latest.has(surface.id);
    const inert: Record<string, unknown> = live ? {} : { inert: "", "aria-disabled": true };
    return (
      <div
        key={surface.id}
        data-testid="a2ui-surface"
        data-surface-id={surface.id}
        data-interactive={live}
        style={live ? undefined : { opacity: 0.6 }}
        {...inert}
      >
        <A2UISurface surface={surface} onError={chat.chat.reportRenderError} />
      </div>
    );
  };
  const placed = (turnId: number | undefined) =>
    chat.surfaces.filter((s) => at.get(s.id) === turnId);
  const transcript = (
    <div
      data-testid="a2ui-transcript"
      style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minWidth: 0 }}
    >
      {chat.turns.map((turn) => (
        <TurnView
          key={turn.id}
          turn={turn}
          labels={labels}
          retry={turn === last && chat.status === "error" ? () => void chat.retry() : undefined}
          {...slots}
        >
          {placed(turn.id).length === 0 ? null : <Provider>{placed(turn.id).map(view)}</Provider>}
        </TurnView>
      ))}
      {placement === "panel" || placed(undefined).length === 0 ? null : (
        <Provider>{placed(undefined).map(view)}</Provider>
      )}
      {chat.working === undefined
        ? null
        : (slots.renderWorking?.(chat.working, () => void chat.cancel()) ?? (
            <WorkingView working={chat.working} cancel={() => void chat.cancel()} labels={labels} />
          ))}
    </div>
  );
  const row: CSSProperties = { display: "flex", gap: 16, alignItems: "flex-start" };
  return (
    <div
      data-testid="a2ui-chat"
      data-placement={placement}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      {chat.models === undefined ? null : (
        <label style={{ fontSize: 12 }}>
          {labels.model}{" "}
          <select
            value={chat.models.current}
            disabled={chat.models.pending || chat.working !== undefined}
            onChange={(event) => void chat.setModel(event.target.value)}
          >
            {chat.models.list.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {placement === "panel" ? (
        <div style={row}>
          {transcript}
          <div data-testid="a2ui-panel" style={{ flex: 1, minWidth: 0 }}>
            <Provider>{chat.surfaces.map(view)}</Provider>
          </div>
        </div>
      ) : (
        transcript
      )}
      <Composer
        send={(text) => void chat.send(text)}
        busy={chat.working !== undefined || chat.models?.pending === true}
        labels={labels}
      />
    </div>
  );
}
