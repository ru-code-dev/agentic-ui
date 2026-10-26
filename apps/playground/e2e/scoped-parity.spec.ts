import { expect, test, type Page } from "@playwright/test";
import { watchConsole } from "./support/console.ts";
import { decode, differingPixels, saveScreenshot } from "./support/pixels.ts";

/** Chakra `radii.md`: the dialog's rounded corners show whatever page lies under the overlay. */
const DIALOG_CORNER_INSET = 6;

const COMPONENTS = [
  "Avatar",
  "Box",
  "Button",
  "Center",
  "Checkbox",
  "Container",
  "Flex",
  "Grid",
  "Heading",
  "Icon",
  "Input",
  "List",
  "Modal",
  "RadioGroup",
  "Switch",
  "Table",
  "Tabs",
  "Tag",
  "Text",
];

async function openModal(page: Page) {
  await page.getByRole("button", { name: "Показать детали" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("transform", "none");
  await expect(dialog).toHaveCSS("opacity", "1");
  return dialog;
}

test.describe("DEC-001: scoped in-document kit vs a Chakra-only page", () => {
  for (const name of COMPONENTS) {
    test(`${name} snippet is pixel-identical`, async ({ page }) => {
      const console = watchConsole(page);
      await page.goto(`/reference.html?component=${name}`);
      const reference = page.getByTestId(`reference-${name}`);
      await expect(reference.locator("*").first()).toBeAttached();
      const expected = await reference.screenshot({ animations: "disabled" });
      await page.goto(`/components/${name}`);
      const scoped = page.getByTestId(`scoped-${name}`).locator("[data-ui-kit-root]");
      await expect(scoped.locator("*").first()).toBeAttached();
      const actual = await scoped.screenshot({ animations: "disabled" });
      expect(differingPixels(decode(expected), decode(actual))).toBe(0);
      console.expectClean();
    });
  }

  test("an open Modal dialog is pixel-identical and portals inside the kit root", async ({
    page,
  }) => {
    await page.goto("/reference.html?component=Modal");
    const reference = await (await openModal(page)).screenshot({ animations: "disabled" });
    await page.goto("/components/Modal");
    const dialog = await openModal(page);
    await expect(page.locator("[data-ui-kit-root] [role=dialog]")).toHaveCount(1);
    const scoped = await dialog.screenshot({ animations: "disabled" });
    saveScreenshot("parity-modal-open-reference", reference);
    saveScreenshot("parity-modal-open-scoped", scoped);
    expect(
      differingPixels(decode(reference, DIALOG_CORNER_INSET), decode(scoped, DIALOG_CORNER_INSET)),
    ).toBe(0);
  });
});

test("the kit leaves the playground shell untouched, also with a Modal open", async ({ page }) => {
  await page.goto("/components/Modal");
  await openModal(page);
  const shell = await page.evaluate(() => {
    const html = document.documentElement;
    const heading = document.querySelector("h1") as HTMLElement;
    const sidebar = document.querySelector("aside") as HTMLElement;
    return {
      htmlDataTheme: html.getAttribute("data-theme"),
      htmlChakraVar: getComputedStyle(html).getPropertyValue("--chakra-colors-gray-800"),
      bodyClass: document.body.className,
      bodyOverflow: getComputedStyle(document.body).overflow,
      bodyFontIsShell: getComputedStyle(document.body).fontFamily.includes("Inter"),
      headingPosition: getComputedStyle(heading).position,
      sidebarBorder: getComputedStyle(sidebar).borderRightColor,
      toastPortal: document.getElementById("chakra-toast-portal"),
    };
  });
  expect(shell).toEqual({
    htmlDataTheme: null,
    htmlChakraVar: "",
    bodyClass: "",
    bodyOverflow: "visible",
    bodyFontIsShell: true,
    headingPosition: "static",
    sidebarBorder: "rgba(255, 255, 255, 0.07)",
    toastPortal: null,
  });
});
