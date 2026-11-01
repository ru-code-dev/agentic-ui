import type { UseA2UIChat } from "@agentic-ui/a2ui-react";
import type { ChatTurn, TurnResult, TurnState } from "@agentic-ui/a2ui-react/core";
import { Bot, RotateCcw, User } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { ProblemCard } from "./problem-card.tsx";
import { elapsedLabel } from "./progress-text.ts";

/** SV-C27: every turn state has its own badge (a text-only reply is not "Интерфейс готов"). */
const STATUS: Record<
  TurnState,
  { label: string; variant: "success" | "warning" | "outline" | "error" }
> = {
  ui: { label: "Интерфейс готов", variant: "success" },
  text: { label: "Ответ текстом", variant: "outline" },
  "failed-ui": { label: "Не удалось построить интерфейс", variant: "warning" },
  cancelled: { label: "Отменено", variant: "outline" },
  error: { label: "Ошибка запроса", variant: "error" },
  rejected: { label: "Интерфейс отклонён страницей", variant: "error" },
};

function Bubble({
  icon,
  children,
  testId,
}: {
  icon: ReactNode;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div className="flex gap-2.5" data-testid={testId}>
      <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground [&_svg]:size-3.5">
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px]">{children}</div>
    </div>
  );
}

function Result({ result, modelName }: { result: TurnResult; modelName: string | undefined }) {
  const status = STATUS[result.state];
  const details = [
    result.attempts > 0 ? `попыток: ${result.attempts}` : undefined,
    elapsedLabel(result.durationMs),
    modelName,
  ].filter(Boolean);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status.variant} data-testid="turn-status">
          {status.label}
        </Badge>
        <span className="text-[11.5px] text-muted-foreground">{details.join(" · ")}</span>
      </div>
      {result.problem === undefined ? null : <ProblemCard problem={result.problem} />}
      {result.text === "" ? null : (
        <p className="whitespace-pre-wrap text-foreground/90">{result.text}</p>
      )}
      {result.errors.length === 0 ? null : (
        <details className="text-[12px]">
          <summary className="cursor-pointer text-muted-foreground">
            Последние ошибки ({result.errors.length})
            {result.reason === undefined ? "" : ` · ${result.reason}`}
          </summary>
          <ul className="mt-1 flex flex-col gap-1 pl-4 font-mono text-[11.5px] text-muted-foreground">
            {result.errors.map((error) => (
              <li key={error} className="list-disc break-words">
                {error}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/** One turn of the chat: the user's prompt or action, then the agent's outcome. */
export function TurnView({
  turn,
  last,
  chat,
}: {
  turn: ChatTurn;
  last: boolean;
  chat: UseA2UIChat;
}) {
  const { request, result } = turn;
  const modelName = chat.models?.list.find((m) => m.id === turn.model)?.name ?? turn.model;
  return (
    <div className="flex flex-col gap-3" data-testid="chat-turn">
      <Bubble icon={<User />} testId="turn-request">
        {request.kind === "prompt" ? (
          <p
            className="line-clamp-6 whitespace-pre-wrap"
            data-testid={request.repair ? "repair-request" : undefined}
          >
            {request.repair ? "Автоисправление: " : null}
            {request.text}
          </p>
        ) : (
          <p>
            Действие <span className="font-mono text-[12px]">{request.name}</span>{" "}
            <span className="text-muted-foreground">({request.surfaceId})</span>
          </p>
        )}
      </Bubble>
      {result === undefined ? null : (
        <Bubble icon={<Bot />} testId="turn-result">
          <Result result={result} modelName={modelName} />
          {last && (result.state === "error" || result.state === "rejected") ? (
            <Button
              size="xs"
              variant="outline"
              className="self-start"
              onClick={() => void chat.retry()}
            >
              <RotateCcw />
              Повторить
            </Button>
          ) : null}
        </Bubble>
      )}
    </div>
  );
}
