import { STYLE_PROP_NAMES } from "@agentic-ui/ui-kit-one-catalog";
import { screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { z } from "zod";
import { spec } from "@a2ui/web_core/catalog";
import { renderMappingMarkdown } from "../scripts/mapping-markdown.ts";
import type { FixedKeyCheck } from "../src/passthrough-options.ts";
import { passthrough } from "../src/passthrough.tsx";
import { BADGE_SCHEMES, BadgeApi, FakeBadge, badgeCatalog } from "./support/badge.tsx";
import { failOnConsoleNoise } from "./support/console-guard.ts";
import { components, surface } from "./support/messages.ts";
import { renderMessages } from "./support/render-messages.tsx";

const badge = passthrough(BadgeApi, FakeBadge, "Badge", {
  values: { colorScheme: BADGE_SCHEMES },
  fixed: { density: "compact" },
});

const render = (props: object) =>
  renderMessages(
    [surface("b"), components("b", [{ id: "root", component: "Badge", label: "Новый", ...props }])],
    { catalog: badgeCatalog(badge.implementation) },
  ).view;

describe("partial kit props through passthrough, no wrapper [DEC-046]", () => {
  failOnConsoleNoise();

  it("passes a value of a subset (pickTokens) through unchanged", () => {
    render({ size: "sm" });
    expect(screen.getByTestId("badge").dataset.size).toBe("sm");
  });

  it("renders a renamed value as its kit value (option values)", () => {
    render({ colorScheme: "success" });
    expect(screen.getByTestId("badge").dataset.colorScheme).toBe("green");
    expect(screen.getByText("Новый")).toBeTruthy();
  });

  it("always sets a fixed hidden kit prop (option fixed)", () => {
    render({});
    expect(screen.getByTestId("badge").dataset.density).toBe("compact");
  });

  it("writes value maps and fixed props into the mapping and MAPPING.md", () => {
    expect(badge.mapping.props.colorScheme).toMatchObject({
      kit: "colorScheme",
      values: { neutral: "gray", success: "green", danger: "red" },
    });
    expect(badge.mapping.props.size).toEqual({ kit: "size", identity: true });
    expect(badge.mapping.fixed).toEqual({ density: "compact" });
    const markdown = renderMappingMarkdown([badge.mapping], ["Badge"], {}, STYLE_PROP_NAMES);
    expect(markdown).toContain("`neutral` → `gray`, `success` → `green`, `danger` → `red`");
    expect(markdown).toContain("| — (hidden) | `density` | fixed `compact` |");
  });

  it("rejects at compile time what the kit cannot render (typecheck runs these lines)", () => {
    const outside = {
      name: "Badge",
      schema: spec(z.object({ size: z.enum(["sm", "xl"]).optional() }), {
        mixins: ["ComponentCommon"],
      }),
    };
    const values = { colorScheme: BADGE_SCHEMES };
    const badTarget = { values: { colorScheme: { ...BADGE_SCHEMES, danger: "blue" } } } as const;
    const badSource = { values: { colorScheme: { ...BADGE_SCHEMES, info: "gray" } } } as const;
    const badFixed = { values, fixed: { density: "loose" } } as const;
    const exposedFixed = { values, fixed: { size: "md" } } as const;
    const rejected = [
      // @ts-expect-error a contract value outside the kit's values ("xl")
      () => passthrough(outside, FakeBadge, "Badge"),
      // @ts-expect-error renamed contract values ("neutral", …) are not kit values without a map
      () => passthrough(BadgeApi, FakeBadge, "Badge"),
      // @ts-expect-error a map target that is not a kit value
      () => passthrough(BadgeApi, FakeBadge, "Badge", badTarget),
      // @ts-expect-error a map source the contract does not have
      () => passthrough(BadgeApi, FakeBadge, "Badge", badSource),
      // @ts-expect-error a fixed value that is not a kit value
      () => passthrough(BadgeApi, FakeBadge, "Badge", badFixed),
      // @ts-expect-error a fixed prop the contract exposes
      () => passthrough(BadgeApi, FakeBadge, "Badge", exposedFixed),
    ];
    expect(rejected).toHaveLength(6);
  });

  it("names the key when a fixed prop is missing from the kit facade's Pick list [A3-28]", () => {
    type Kit = ComponentProps<typeof FakeBadge>;
    type Glow = NonNullable<
      NonNullable<FixedKeyCheck<typeof BadgeApi, Kit, { fixed: { glow: true } }>["fixed"]>["glow"]
    >;
    expectTypeOf<
      keyof Glow
    >().toEqualTypeOf<`fixed key "glow" is not a prop of the kit facade: add it to the facade's Pick<...> list (src/kit/)`>();
    type Size = NonNullable<
      NonNullable<FixedKeyCheck<typeof BadgeApi, Kit, { fixed: { size: "md" } }>["fixed"]>["size"]
    >;
    expectTypeOf<
      keyof Size
    >().toEqualTypeOf<`fixed key "size" is a contract prop: it cannot be fixed`>();
    const unpicked = { fixed: { glow: true } } as const;
    // @ts-expect-error a fixed key the facade does not pick (REMAP recipe 6: add it to the Pick list)
    const rejected = () => passthrough(BadgeApi, FakeBadge, "Badge", unpicked);
    expect(rejected).toBeTypeOf("function");
  });
});
