import type { UseA2UIChat } from "@agentic-ui/a2ui-react";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select.tsx";

/** SV-C25: the chat's model from GET /models; hidden when the server offers no list. */
export function ModelSelect({ chat }: { chat: UseA2UIChat }) {
  const { models } = chat;
  const busy = chat.working !== undefined;
  if (models === undefined) return null;
  const name = (id: string) => models.list.find((model) => model.id === id)?.name ?? id;
  return (
    <span className="flex items-center gap-2">
      <Select
        value={models.current}
        onValueChange={(value) => void chat.setModel(String(value))}
        disabled={busy || models.pending === true}
      >
        <SelectTrigger size="sm" className="h-7 w-auto min-w-40 text-[12.5px]" aria-label="Модель">
          <SelectValue>{(value: string) => name(value)}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {models.list.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              <span className="flex w-full flex-col">
                {model.name}
                {model.description ? (
                  <span className="text-[11px] text-muted-foreground">{model.description}</span>
                ) : null}
              </span>
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      {models.pending === true ? (
        <span data-testid="model-pending" className="text-[12px] text-muted-foreground">
          применяю…
        </span>
      ) : null}
      {models.error === undefined ? null : (
        <span role="alert" data-testid="model-error" className="text-[12px] text-destructive">
          {models.error}
        </span>
      )}
    </span>
  );
}
