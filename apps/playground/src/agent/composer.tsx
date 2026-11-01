import type { UseA2UIChat } from "@agentic-ui/a2ui-react";
import { ClipboardPaste, SendHorizontal } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { Button } from "../components/ui/button.tsx";
import { Textarea } from "../components/ui/textarea.tsx";

const SAMPLE =
  "Дата,Магазин,Сумма\n2026-10-01,Пятёрочка,1250\n2026-10-03,Аптека,640\n2026-10-04,Такси,890\n\n" +
  "Покажи эти траты таблицей с итоговой суммой.";

/** Paste + instruction, sent with the button or Ctrl/Cmd+Enter. */
export function Composer({ chat }: { chat: UseA2UIChat }) {
  const [text, setText] = useState("");
  // A3-17: nothing is sent while a model change is in flight.
  const busy = chat.working !== undefined || chat.models?.pending === true;
  const send = () => {
    if (busy || text.trim() === "") return;
    void chat.send(text);
    setText("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      send();
    }
  };
  return (
    <div className="flex flex-col gap-2 border-t p-3">
      <Textarea
        aria-label="Данные и инструкция"
        placeholder="Вставьте данные и напишите, что показать…"
        className="min-h-28 font-mono text-[12.5px] [&_textarea]:max-h-64"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => setText(SAMPLE)} disabled={busy}>
          <ClipboardPaste />
          Пример
        </Button>
        <span className="ml-auto text-[11px] text-muted-foreground">⌘/Ctrl + Enter</span>
        <Button size="sm" onClick={send} disabled={busy || text.trim() === ""}>
          <SendHorizontal />
          Отправить
        </Button>
      </div>
    </div>
  );
}
