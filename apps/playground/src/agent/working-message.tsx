import type { UseA2UIChat } from "@agentic-ui/a2ui-react";
import type { Working } from "@agentic-ui/a2ui-react/core";
import { LoaderCircle, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/button.tsx";
import { elapsedLabel, progressLine } from "./progress-text.ts";

/**
 * SV-C20: shown while a turn runs: elapsed timer, Cancel, and (when the server has the optional
 * progress endpoint) the repair attempt with its errors. Nothing of an invalid draft is shown.
 */
export function WorkingMessage({ working, chat }: { working: Working; chat: UseA2UIChat }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const line = progressLine(working.progress);
  const errors = working.progress?.state === "repairing" ? working.progress.errors : [];
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-brand/30 bg-brand/[0.06] px-3 py-2.5"
      data-testid="agent-working"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-[13px]">
        <LoaderCircle className="size-4 animate-spin text-brand" />
        <span>{working.cancelling ? "Отменяю…" : "Агент строит интерфейс…"}</span>
        <span className="font-mono text-[12px] text-muted-foreground" data-testid="agent-elapsed">
          {elapsedLabel(now - working.startedAt)}
        </span>
        <Button
          size="xs"
          variant="outline"
          className="ml-auto"
          disabled={working.cancelling}
          onClick={() => void chat.cancel()}
        >
          <Square />
          Отменить
        </Button>
      </div>
      {working.cancelUnconfirmed ? (
        <p
          className="text-[12px] text-warning-foreground"
          role="status"
          data-testid="cancel-unconfirmed"
        >
          Сервер не подтвердил отмену. Нажмите «Отменить» ещё раз, чтобы перестать ждать ответа.
        </p>
      ) : null}
      {line === undefined ? null : (
        <details className="text-[12.5px]" data-testid="agent-progress">
          <summary className="cursor-pointer text-warning-foreground">{line}</summary>
          <ul className="mt-1.5 flex flex-col gap-1 pl-4 font-mono text-[11.5px] text-muted-foreground">
            {errors.map((error) => (
              <li key={error} className="list-disc">
                {error}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
