import { PackageOpen, Plus, Trash2, Workflow } from "lucide-react";
import { IconButton } from "../../components/icon-button.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import { Textarea } from "../../components/ui/textarea.tsx";
import { useWorkspace, type MockRule } from "../../state/workspace-store.ts";
import { parseRule } from "../mock-replies.ts";
import { EmptyHint } from "./empty-hint.tsx";

function RuleCard({ rule }: { rule: MockRule }) {
  const { updateRule, deleteRule } = useWorkspace();
  const parsed = parseRule(rule);
  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-card p-3" data-testid="mock-rule">
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-muted-foreground">When</span>
        <Input
          aria-label="Event name"
          size="sm"
          className="w-64 font-mono text-[12.5px]"
          placeholder="event.name"
          value={rule.event}
          onChange={(event) => updateRule(rule.id, { event: event.target.value })}
        />
        <span className="text-[12px] text-muted-foreground">fires, reply with</span>
        <span
          className={
            parsed.ok
              ? "text-[12px] text-muted-foreground"
              : "text-[12px] text-destructive-foreground"
          }
        >
          {parsed.ok
            ? `${parsed.messages.length} ${parsed.messages.length === 1 ? "message" : "messages"}`
            : parsed.error}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Switch
            aria-label="Enabled"
            checked={rule.enabled}
            onCheckedChange={(enabled) => updateRule(rule.id, { enabled })}
          />
          <IconButton label="Delete rule" onClick={() => deleteRule(rule.id)}>
            <Trash2 />
          </IconButton>
        </div>
      </div>
      <Textarea
        aria-label="Reply messages"
        className="h-28 font-mono text-[12px] leading-relaxed"
        spellCheck={false}
        value={rule.messages}
        onChange={(event) => updateRule(rule.id, { messages: event.target.value })}
      />
    </li>
  );
}

/** Mock agent replies: when an action event fires, matching rules apply their messages (PG-12). */
export function MockRulesPanel() {
  const { mockRules, addRule, loadPresets } = useWorkspace();
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <p className="text-[12.5px] text-muted-foreground">
          Simulated agent replies, applied to every open preview when the event fires.
        </p>
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="outline" onClick={loadPresets}>
            <PackageOpen />
            Load presets
          </Button>
          <Button size="sm" onClick={() => addRule()}>
            <Plus />
            Add rule
          </Button>
        </div>
      </div>
      {mockRules.length === 0 ? (
        <EmptyHint
          icon={Workflow}
          title="No mock rules"
          hint="Add a rule or load the presets (login, transfer, fraud, loan, onboarding)."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {mockRules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} />
          ))}
        </ul>
      )}
    </div>
  );
}
