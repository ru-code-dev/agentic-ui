import { expect, test, type Locator } from "@playwright/test";
import { EventEmitter, once } from "node:events";
import { openAgent } from "./support/agent.ts";
import { watchConsole } from "./support/console.ts";
import { ROUTES } from "./support/routes.ts";
import { openPanel, openWorkspace, previewFrame, setEditorText } from "./support/workspace.ts";

/**
 * PG-19 beyond the dark colours of theme.spec.ts (A2-M7, undoes the P10-D10 narrowing): the SPEC's checkable
 * design-system items on every route. The subjective "quality bar comparable to Linear/Vercel" is the owner's
 * review (gate 05b, DEC-039), not a test.
 */
interface DesignProbe {
  readonly fontSizes: readonly number[];
  readonly fontWeights: readonly number[];
  readonly spacings: readonly number[];
  readonly loudBorders: readonly string[];
  readonly foreignIcons: readonly string[];
  readonly icons: number;
}

/** Runs in the page: the playground chrome only (not the kit preview, the code editor, highlighted code). */
function probeDesign(): DesignProbe {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) throw new Error("no 2d canvas");
  const rgba = (css: string) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#000";
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate serialises probeDesign alone, so its helpers must live inside it
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const page = rgba(getComputedStyle(document.body).backgroundColor);
  /** WCAG luminance of `css` painted over the page background. */
  const luminance = (css: string) => {
    const { r, g, b, a } = rgba(css);
    const mix = (fg: number, bg: number) => linear(a * fg + (1 - a) * bg);
    return 0.2126 * mix(r, page.r) + 0.7152 * mix(g, page.g) + 0.0722 * mix(b, page.b);
  };
  const pageLuminance = luminance(getComputedStyle(document.body).backgroundColor);
  const sizes = new Set<number>();
  const weights = new Set<number>();
  const spacings = new Set<number>();
  const loudBorders: string[] = [];
  const foreignIcons: string[] = [];
  let icons = 0;
  for (const element of document.querySelectorAll("body *")) {
    if (element.closest("[data-ui-kit-root], .cm-editor, pre.shiki") !== null) continue;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    if (style.display === "none" || style.visibility !== "visible" || box.width * box.height === 0)
      continue;
    if ([...element.childNodes].some((node) => node.nodeType === 3 && node.textContent?.trim())) {
      sizes.add(Number.parseFloat(style.fontSize));
      weights.add(Number(style.fontWeight));
    }
    for (const value of [
      style.paddingTop,
      style.paddingRight,
      style.paddingBottom,
      style.paddingLeft,
    ])
      if (Number.parseFloat(value) > 0) spacings.add(Number.parseFloat(value));
    for (const value of [style.rowGap, style.columnGap])
      if (value.endsWith("px") && Number.parseFloat(value) > 0)
        spacings.add(Number.parseFloat(value));
    const border = style.borderTopColor;
    const bordered = Number.parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== "none";
    if (bordered && rgba(border).a > 0 && border !== style.backgroundColor) {
      const ratio =
        (Math.max(luminance(border), pageLuminance) + 0.05) /
        (Math.min(luminance(border), pageLuminance) + 0.05);
      if (ratio > 2)
        loudBorders.push(`${element.tagName} ${element.getAttribute("class")} ${border} ${ratio}`);
    }
    if (element.tagName.toLowerCase() === "svg") {
      icons += 1;
      if (!element.classList.contains("lucide"))
        foreignIcons.push(`svg in ${element.parentElement?.getAttribute("class") ?? "?"}`);
    }
  }
  return {
    fontSizes: [...sizes].toSorted((a, b) => a - b),
    fontWeights: [...weights].toSorted((a, b) => a - b),
    spacings: [...spacings].toSorted((a, b) => a - b),
    loudBorders,
    foreignIcons,
    icons,
  };
}

test.describe("[PG-19] one design system on every route", () => {
  for (const [path, open] of ROUTES) {
    test(`${path}: type scale, spacing scale, subtle borders, Lucide icons [PG-19]`, async ({
      page,
    }) => {
      await open(page);
      const probe = await page.evaluate(probeDesign);
      for (const size of probe.fontSizes) {
        expect(size, "font sizes 10–30 px on a 0.5 px step").toBeGreaterThanOrEqual(10);
        expect(size).toBeLessThanOrEqual(30);
        expect(Number.isInteger(size * 2), `font size ${size}`).toBe(true);
      }
      expect(
        probe.fontSizes.length,
        `type scale ${probe.fontSizes.join(", ")}`,
      ).toBeLessThanOrEqual(10);
      expect(probe.fontWeights.every((weight) => [400, 500, 600, 700].includes(weight))).toBe(true);
      for (const space of probe.spacings) {
        expect(Number.isInteger(space), `padding/gap ${space} px is a whole pixel`).toBe(true);
        expect(space).toBeLessThanOrEqual(32);
      }
      expect(
        probe.spacings.length,
        `spacing scale ${probe.spacings.join(", ")}`,
      ).toBeLessThanOrEqual(16);
      expect(probe.loudBorders, "borders are subtle (contrast ≤ 2 against the page)").toEqual([]);
      expect(probe.icons).toBeGreaterThan(0);
      expect(probe.foreignIcons, "every icon is a Lucide icon").toEqual([]);
    });
  }
});

const backgroundOf = (locator: Locator) =>
  locator.evaluate((element) => getComputedStyle(element).backgroundColor);

const look = (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return `${style.backgroundColor} ${style.color} ${style.borderColor}`;
  });

test("[PG-19] hover, pressed and active (selected) states, with transitions; menus float with elevation", async ({
  page,
}) => {
  await openWorkspace(page);
  const example = page.getByTestId("example-02-signup");
  const before = await backgroundOf(example);
  expect(
    await example.evaluate((element) => getComputedStyle(element).transitionDuration),
  ).not.toBe("0s");
  await example.hover();
  await expect.poll(() => backgroundOf(example)).not.toBe(before);

  const tabs = page.getByRole("tab");
  const selected = tabs.and(page.locator("[data-active]")).first();
  const other = tabs.and(page.locator(":not([data-active])")).first();
  await page.mouse.move(0, 0);
  expect(await look(selected), "the selected tab stands out").not.toBe(await look(other));

  await openAgent(page);
  const sample = page.getByRole("button", { name: "Пример" });
  const resting = await backgroundOf(sample);
  expect(await sample.evaluate((element) => getComputedStyle(element).transitionDuration)).not.toBe(
    "0s",
  );
  await sample.hover();
  await page.mouse.down();
  await expect
    .poll(() => backgroundOf(sample), "a pressed button shows feedback")
    .not.toBe(resting);
  await page.mouse.move(0, 0);
  await page.mouse.up();

  await page.getByRole("combobox", { name: "Модель" }).click();
  const menu = page.getByRole("listbox");
  await expect(menu).toBeVisible();
  const elevation = await menu.evaluate((element) => {
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      const shadow = getComputedStyle(node).boxShadow;
      if (shadow !== "none") return shadow;
    }
    return "none";
  });
  expect(elevation, "an open menu casts a shadow").not.toBe("none");
});

test("[PG-19] empty, loading and error states", async ({ page }) => {
  const console = watchConsole(page);
  await openAgent(page);
  await expect(page.locator("p", { hasText: "Новый чат" })).toBeVisible();
  await expect(page.locator("p", { hasText: "Здесь появится интерфейс" })).toBeVisible();

  await openWorkspace(page);
  await openPanel(page, /Events/);
  await expect(page.getByText("No events yet")).toBeVisible();
  await openPanel(page, /Errors/);
  await expect(page.getByText("No errors")).toBeVisible();
  await setEditorText(page, '[{"version": "v0.9",}]');
  await expect(page.getByTestId("editor-status")).toContainText("Invalid JSON");
  await expect(page.getByTestId("error-row")).toContainText(["JSON"]);

  const gate = new EventEmitter();
  const opened = once(gate, "open");
  await page.route("**/tokenizers/qwen2.5/tokenizer.json", async (route) => {
    await opened;
    await route.continue();
  });
  await page.goto("/llm-context");
  const loading = page.getByText(/Loading the .* tokenizer…/);
  await expect(loading).toBeVisible();
  expect(
    await loading.locator("svg").evaluate((svg) => getComputedStyle(svg).animationName),
  ).not.toBe("none");
  gate.emit("open");
  await expect(page.getByTestId("prompt-total")).toBeVisible({ timeout: 30_000 });
  console.expectClean();
});

test("[PG-19] the Chakra preview renders in Chakra's dark colour mode by default", async ({
  page,
}) => {
  await openWorkspace(page);
  const heading = previewFrame(page).getByRole("heading", { name: "Вход в интернет-банк" });
  const brightness = (which: "text" | "page") =>
    heading.evaluate((element, of) => {
      const canvas = document
        .createElement("canvas")
        .getContext("2d", { willReadFrequently: true });
      if (canvas === null) throw new Error("no 2d canvas");
      const style = getComputedStyle(of === "text" ? element : document.body);
      canvas.fillStyle = of === "text" ? style.color : style.backgroundColor;
      canvas.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0] = canvas.getImageData(0, 0, 1, 1).data;
      return (r + g + b) / 3;
    }, which);
  // Chakra fades the body background in: wait for it to settle.
  await expect.poll(() => brightness("page"), "on the dark kit page background").toBeLessThan(60);
  expect(await brightness("text"), "dark mode: light kit text").toBeGreaterThan(200);
});
