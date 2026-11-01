import { expect, test, type Locator } from "@playwright/test";
import { openWorkspace, previewFrame } from "./support/workspace.ts";

const background = (locator: Locator) =>
  locator.evaluate((node) => getComputedStyle(node).backgroundColor);

test("[PG-29] the device frame, catalog cards and detail preview sit on the kit's own page background", async ({
  page,
}) => {
  await openWorkspace(page);
  const body = previewFrame(page).locator("body");
  // The kit body animates its background-color on load: wait until it is opaque.
  await expect.poll(() => background(body)).toMatch(/^rgb\(/);
  const kitBody = await background(body);
  expect(await background(page.getByTestId("device-frame"))).toBe(kitBody);
  await page.goto("/components");
  const card = page.getByTestId("card-Text").locator("> div").first();
  expect(await background(card)).toBe(kitBody);
  await page.goto("/components/Text");
  expect(await background(page.getByTestId("scoped-Text").locator("../.."))).toBe(kitBody);
});
