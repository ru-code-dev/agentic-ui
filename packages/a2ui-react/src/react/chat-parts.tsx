import { useState, type CSSProperties, type ReactNode } from "react";
import type { ChatTurn, Working } from "../core/chat-state.ts";
import type { ResponseProblem } from "../core/responses.ts";
import type { ChatLabels } from "./labels.ts";

/** Render slots of the default chat (SV-C26; no per-component overrides). */
export interface ChatSlots {
  readonly renderWorking?: (working: Working, cancel: () => void) => ReactNode;
  /** The request failed (network, HTTP, malformed answer, another contract version). */
  readonly renderError?: (problem: ResponseProblem | undefined, retry: () => void) => ReactNode;
  /** The page refused the reply's UI (DEC-054); shown after its one repair failed too. */
  readonly renderInvalid?: (problem: ResponseProblem | undefined, retry: () => void) => ReactNode;
  /** Text + failed UI (SV-C27): the server gave up on the UI and sent no surface. */
  readonly renderPlaceholder?: (turn: ChatTurn) => ReactNode;
}

const box: CSSProperties = {
  border: "1px solid rgba(128,128,128,.35)",
  borderRadius: 6,
  padding: "6px 10px",
};
const muted: CSSProperties = { opacity: 0.7, fontSize: 12 };

function Problem({
  title,
  problem,
  retry,
  label,
}: {
  title: string;
  problem: ResponseProblem | undefined;
  retry?: (() => void) | undefined;
  label: string;
}) {
  return (
    <div role="alert" style={{ ...box, borderColor: "rgba(220,80,80,.6)" }}>
      <strong>{title}</strong>
      {problem === undefined ? null : (
        <div style={muted}>
          {problem.request} {problem.httpStatus ?? ""} — {problem.title}
          {problem.details.length === 0 ? null : (
            <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
              {problem.details.slice(0, 10).map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {retry === undefined ? null : (
        <button type="button" onClick={retry} style={{ marginTop: 4 }}>
          {label}
        </button>
      )}
    </div>
  );
}

export interface TurnProps extends ChatSlots {
  readonly turn: ChatTurn;
  readonly labels: ChatLabels;
  /** Only the latest turn offers «retry». */
  readonly retry: (() => void) | undefined;
  /** The surfaces placed under this turn. */
  readonly children?: ReactNode;
}

/** One turn: the request, then the reply's text bubble (always), its state and its surfaces (SV-C27). */
export function TurnView({ turn, labels, retry, children, ...slots }: TurnProps) {
  const { request, result } = turn;
  const asked =
    request.kind === "prompt"
      ? `${request.repair ? `${labels.repair}: ` : ""}${request.text}`
      : `${labels.action} ${request.name} (${request.surfaceId})`;
  const retryFn = retry ?? (() => {});
  return (
    <div
      data-testid="a2ui-turn"
      data-state={result?.state ?? "working"}
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div
        data-testid="a2ui-request"
        style={{ ...box, alignSelf: "flex-end", maxWidth: "85%", whiteSpace: "pre-wrap" }}
      >
        {asked}
      </div>
      {result === undefined ? null : (
        <>
          {result.text === "" ? null : (
            <div data-testid="a2ui-text" style={{ ...box, whiteSpace: "pre-wrap" }}>
              {result.text}
            </div>
          )}
          {result.state === "cancelled" ? <div style={muted}>{labels.cancelled}</div> : null}
          {result.state === "error"
            ? (slots.renderError?.(result.problem, retryFn) ?? (
                <Problem
                  title={labels.error}
                  problem={result.problem}
                  retry={retry}
                  label={labels.retry}
                />
              ))
            : null}
          {result.state === "rejected"
            ? (slots.renderInvalid?.(result.problem, retryFn) ?? (
                <Problem
                  title={labels.invalidUi}
                  problem={result.problem}
                  retry={retry}
                  label={labels.retry}
                />
              ))
            : null}
          {result.state === "failed-ui" && result.created.length + result.updated.length === 0
            ? (slots.renderPlaceholder?.(turn) ?? (
                <div data-testid="a2ui-placeholder" style={{ ...box, ...muted }}>
                  {labels.failedUi}
                </div>
              ))
            : null}
        </>
      )}
      {children}
    </div>
  );
}

export function WorkingView({
  working,
  cancel,
  labels,
}: {
  working: Working;
  cancel: () => void;
  labels: ChatLabels;
}) {
  const { progress } = working;
  return (
    <div
      data-testid="a2ui-working"
      role="status"
      style={{ ...box, ...muted, display: "flex", gap: 8, alignItems: "center" }}
    >
      <span>
        {labels.working}
        {progress?.state === "repairing" ? ` (${progress.attempt}/${progress.maxAttempts})` : "…"}
      </span>
      <button type="button" onClick={cancel}>
        {working.cancelling ? labels.cancelling : labels.cancel}
      </button>
      {working.cancelUnconfirmed ? <span role="status">{labels.cancelUnconfirmed}</span> : null}
    </div>
  );
}

export function Composer({
  send,
  busy,
  labels,
}: {
  send: (text: string) => void;
  busy: boolean;
  labels: ChatLabels;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    if (busy || text.trim() === "") return;
    send(text);
    setText("");
  };
  return (
    <form
      data-testid="a2ui-composer"
      style={{ display: "flex", gap: 6 }}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        aria-label={labels.input}
        placeholder={labels.input}
        value={text}
        rows={2}
        style={{ flex: 1, resize: "vertical" }}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <button type="submit" disabled={busy || text.trim() === ""}>
        {labels.send}
      </button>
    </form>
  );
}
