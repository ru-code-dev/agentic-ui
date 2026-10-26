import { describe, expect, it } from "vite-plus/test";
import { readExamples, readMockRules } from "../scripts/examples.ts";

const compositions = readExamples("compositions");
const EVENTS: Record<string, readonly string[]> = {
  "01-login": ["login.submit"],
  "02-signup": ["signup.submit"],
  "03-settings": ["settings.save"],
  "04-user-list": ["user.open"],
  "05-data-table": [],
  "06-confirm-delete": ["item.delete", "modal.cancel"],
  "07-tabbed-profile": ["profile.edit"],
  "08-pricing": ["plan.select"],
  "09-onboarding": ["onboarding.continue"],
  "10-empty-state": ["empty.create"],
  "11-notifications": ["notification.read"],
  "12-search-filters": ["search.apply"],
  "13-bank-account-overview": ["account.open"],
  "14-bank-transactions": ["transaction.open"],
  "15-bank-transfer": ["transfer.confirm", "transfer.cancel"],
  "16-bank-card-management": ["card.update"],
  "17-bank-loan-offer": ["loan.apply"],
  "18-bank-bill-payment": ["bill.pay"],
  "19-bank-fraud-alert": ["fraud.confirm", "fraud.block"],
  "20-bank-spending-summary": [],
};

const json = (value: unknown) => JSON.stringify(value);
const components = (messages: readonly Record<string, unknown>[]) =>
  messages.flatMap(
    (message) =>
      (message.updateComponents as { components?: Record<string, unknown>[] } | undefined)
        ?.components ?? [],
  );

describe("example compositions", () => {
  it("are the 20 compositions of the spec, each with a name and description", () => {
    expect(
      compositions.map((example) => example.file.replace(/^compositions\/|\.json$/g, "")),
    ).toEqual(Object.keys(EVENTS));
    for (const example of compositions) {
      expect(example.name.length, example.file).toBeGreaterThan(3);
      expect(example.description.length, example.file).toBeGreaterThan(20);
    }
  });

  it("fire exactly the action events the spec lists (plus modal.open on Modal triggers)", () => {
    for (const example of compositions) {
      const events = [...json(example.messages).matchAll(/"event":\{"name":"([^"]+)"/g)].map(
        (match) => match[1],
      );
      const expected = EVENTS[example.file.replace(/^compositions\/|\.json$/g, "")] ?? [];
      expect(new Set(events.filter((name) => name !== "modal.open")), example.file).toEqual(
        new Set(expected),
      );
    }
  });

  it("write Russian text, keep varying data in the data model and send it when they have inputs", () => {
    for (const example of compositions) {
      const text = json(example.messages);
      expect(text, example.file).toMatch(/[А-Яа-яЁё]/);
      expect(text, example.file).toContain('"updateDataModel"');
      expect(text, example.file).toContain('{"path":');
      const hasInputs = components(example.messages).some((c) =>
        ["Input", "Checkbox", "RadioGroup", "Switch", "Tabs"].includes(String(c.component)),
      );
      if (hasInputs) expect(text, example.file).toContain('"sendDataModel":true');
    }
  });

  it("format money in rubles through formatCurrency or currency columns", () => {
    const money = compositions.filter((example) =>
      /formatCurrency|"format":"currency"/.test(json(example.messages)),
    );
    expect(money.length).toBeGreaterThanOrEqual(10);
    expect(json(compositions.map((example) => example.messages))).not.toMatch(
      /"currency":"(?!RUB)[A-Z]{3}"/,
    );
  });

  it("ship mock-rule presets for the four required replies", () => {
    expect(readMockRules().map((rule) => rule.event)).toEqual(
      expect.arrayContaining(["transfer.confirm", "login.submit", "fraud.block", "loan.apply"]),
    );
  });
});
