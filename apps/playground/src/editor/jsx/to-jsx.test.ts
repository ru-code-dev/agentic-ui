import { describe, expect, it } from "vite-plus/test";
import { compositions } from "../../examples.ts";
import { messagesToJsx } from "./to-jsx.ts";

const byId = (id: string) => compositions.find((example) => example.id === id)?.messages ?? [];

describe("messagesToJsx (PG-21)", () => {
  it("renders a form with kit components, bindings and actions", () => {
    const jsx = messagesToJsx(byId("01-login"));
    expect(jsx).toContain('// Surface "login"');
    expect(jsx).toContain('<Container maxW="container.sm" py="10">');
    expect(jsx).toContain("<FormLabel>Электронная почта</FormLabel>");
    expect(jsx).toContain("value={data.form.email}");
    expect(jsx).toContain('onClick={() => send("login.submit", { email: data.form.email })}');
  });

  it("renders templates as map calls over the bound array with item-relative bindings", () => {
    const jsx = messagesToJsx(byId("04-user-list"));
    expect(jsx).toContain("{data.users.map((item) => (");
    expect(jsx).toContain('<Avatar name={item.name} size="md" />');
  });

  it("renders Table, Modal and Tabs as their kit parts", () => {
    expect(messagesToJsx(byId("14-bank-transactions"))).toContain(
      "{data.transactions.map((row) => (",
    );
    expect(messagesToJsx(byId("06-confirm-delete"))).toContain("<ModalCloseButton />");
    expect(messagesToJsx(byId("07-tabbed-profile"))).toContain("<TabPanel>");
  });

  it("renders every composition without missing components", () => {
    for (const composition of compositions)
      expect(messagesToJsx(composition.messages), composition.id).not.toContain("Missing");
  });
});
