import { describe, expect, it } from "vite-plus/test";
import { compositions } from "../../examples.ts";
import { messagesToJsx } from "./to-jsx.ts";

const byId = (id: string) => compositions.find((example) => example.id === id)?.messages ?? [];

describe("messagesToJsx [PG-21]", () => {
  it("renders a form with kit components, bindings and actions", () => {
    const jsx = messagesToJsx(byId("01-login"));
    expect(jsx).toContain('// Surface "login"');
    expect(jsx).toContain('<Container maxW="container.sm" py="10">');
    expect(jsx).toContain("<FormLabel>Электронная почта</FormLabel>");
    expect(jsx).toContain("value={data.form.email}");
    expect(jsx).toContain('onClick={() => send("login.submit", { email: data.form.email })}');
  });

  // A4b-R2: an own fixture, so a contract change (REMAP recipe 3) never breaks this test through an example.
  it("renders templates as map calls over the bound array with item-relative bindings", () => {
    const surfaceId = "users";
    const jsx = messagesToJsx([
      {
        version: "v0.9",
        createSurface: { surfaceId, catalogId: "urn:agentic-ui:catalog:ui-kit-one:v1" },
      },
      {
        version: "v0.9",
        updateComponents: {
          surfaceId,
          components: [
            { id: "root", component: "List", children: { componentId: "row", path: "/users" } },
            { id: "row", component: "Flex", children: ["avatar"] },
            { id: "avatar", component: "Avatar", name: { path: "name" }, size: "md" },
          ],
        },
      },
    ]);
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
