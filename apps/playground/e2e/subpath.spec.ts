import { expect, test } from "@playwright/test";
import { watchConsole } from "./support/console.ts";

/** Runs only in the `subpath` project: the build made with PLAYGROUND_BASE=/agentic-ui/. */
const BASE = "/agentic-ui/";
const ROUTES = [
  ["", "Workspace"],
  ["components", "Components"],
  ["components/Tabs", "Components"],
  ["llm-context", "LLM context"],
] as const;

test.describe("[PG-27] the subfolder build serves every route under /agentic-ui/", () => {
  for (const [path, nav] of ROUTES) {
    test(`${BASE}${path} deep-links with no console output`, async ({ page }) => {
      const console = watchConsole(page);
      await page.goto(path);
      expect(new URL(page.url()).pathname).toBe(`${BASE}${path}`);
      const pages = page.getByRole("navigation", { name: "Pages" });
      await expect(pages.getByRole("link", { name: nav })).toHaveAttribute("aria-current", "page");
      for (const href of await pages
        .getByRole("link")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? "")))
        expect(href.startsWith(BASE)).toBe(true);
      await page.waitForLoadState("networkidle");
      console.expectClean();
    });
  }

  test("the device iframe and the new-tab preview load /agentic-ui/preview", async ({
    page,
    context,
  }) => {
    const console = watchConsole(page);
    await page.goto("");
    const frame = page.getByTestId("device-frame");
    await expect(frame).toHaveAttribute("src", `${BASE}preview`);
    await expect(
      page.frameLocator("[data-testid=device-frame]").getByRole("heading", {
        name: "Вход в интернет-банк",
      }),
    ).toBeVisible();
    const [tab] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("button", { name: "Open in new tab" }).click(),
    ]);
    await expect(tab.getByRole("heading", { name: "Вход в интернет-банк" })).toBeVisible();
    expect(new URL(tab.url()).pathname).toBe(`${BASE}preview`);
    console.expectClean();
  });

  test("the Qwen tokenizer is fetched from under the base", async ({ page }) => {
    const tokenizer = page.waitForResponse((response) =>
      response.url().includes(`${BASE}tokenizers/qwen2.5/tokenizer.json`),
    );
    await page.goto("llm-context");
    expect((await tokenizer).status()).toBe(200);
    await expect(page.getByTestId("tokenizer-accuracy")).toHaveText("exact");
  });
});
