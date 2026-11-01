import { expect, test } from "@playwright/test";
import { openPanel, openWorkspace, previewFrame } from "./support/workspace.ts";

test("[PG-28] messages of a preview tab from another build are ignored and the app says to reload it", async ({
  page,
}) => {
  await openWorkspace(page);
  await expect(page.getByTestId("stale-preview-tab")).toHaveCount(0);
  await page.evaluate(() => {
    const channel = new BroadcastChannel("agentic-ui:preview");
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel.postMessage has no targetOrigin parameter
    const post = (data: unknown) => channel.postMessage(data);
    // A tab of a build before the guard (no envelope) reports an error with its old schema …
    post({
      type: "error",
      previewId: "old-tab",
      source: "runtime",
      message: "expected string",
    });
    // … and an app of another build asks every preview to render something else.
    post({
      build: "another-build",
      message: { type: "render", messages: [], revision: 999 },
    });
    channel.close();
  });
  await expect(page.getByTestId("stale-preview-tab")).toHaveText("Stale preview tab — reload it");
  await openPanel(page, /^Errors/);
  await expect(page.getByRole("tabpanel", { name: /Errors/ })).not.toContainText("expected string");
  await expect(
    previewFrame(page).getByRole("heading", { name: "Вход в интернет-банк" }),
  ).toBeVisible();
});
