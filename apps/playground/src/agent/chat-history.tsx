import type { UseA2UIChat } from "@agentic-ui/a2ui-react";
import { MessageSquareText } from "lucide-react";
import { useEffect, useRef } from "react";
import { EmptyHint } from "../workspace/panels/empty-hint.tsx";
import { ProblemCard } from "./problem-card.tsx";
import { TurnView } from "./turn-view.tsx";
import { WorkingMessage } from "./working-message.tsx";

/** How far (px) from the end of the scrolled history still counts as "reading the end". */
const NEAR_END_PX = 160;

/** True when the scroll container of `marker` shows its end, or the history does not scroll. */
function nearEnd(marker: HTMLElement): boolean {
  let node = marker.parentElement;
  while (node !== null && node.scrollHeight <= node.clientHeight + 1) node = node.parentElement;
  if (node === null) return true;
  // The newest content is just below the end marker's previous position: measure without it.
  const lastChild = marker.previousElementSibling as HTMLElement | null;
  const added = lastChild?.offsetHeight ?? 0;
  return node.scrollHeight - node.scrollTop - node.clientHeight <= NEAR_END_PX + added;
}

/** The conversation: every turn (prompt or action → outcome) and the running turn. */
export function ChatHistory({ chat }: { chat: UseA2UIChat }) {
  const { turns, notices, working } = chat;
  const workingId = working?.turnId;
  const finished = turns.filter((turn) => turn.result !== undefined).length;
  const end = useRef<HTMLDivElement>(null);
  // A3-18: follow the conversation only when it grows (a turn starts or ends, a notice arrives) and
  // the reader is already near its end; progress polls never move the view.
  useEffect(() => {
    if (end.current !== null && nearEnd(end.current)) end.current.scrollIntoView({ block: "end" });
  }, [turns.length, finished, workingId, notices.length]);

  if (turns.length === 0 && notices.length === 0)
    return (
      <EmptyHint
        icon={MessageSquareText}
        title="Новый чат"
        hint="Вставьте данные (таблица, CSV, JSON, текст) и инструкцию, например «покажи таблицей с итогом»."
      />
    );
  return (
    <div className="flex flex-col gap-5 p-4" data-testid="chat-history">
      {notices.map((problem) => (
        <ProblemCard
          key={`${problem.request} ${problem.title}`}
          problem={problem}
          testId="agent-notice"
        />
      ))}
      {turns.map((turn, index) => (
        <TurnView key={turn.id} turn={turn} last={index === turns.length - 1} chat={chat} />
      ))}
      {working === undefined ? null : <WorkingMessage working={working} chat={chat} />}
      <div ref={end} />
    </div>
  );
}
