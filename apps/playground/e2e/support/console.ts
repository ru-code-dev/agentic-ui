import { expect, type Page } from "@playwright/test";

/** Collects console errors/warnings and uncaught exceptions of a page; call `expectClean()` at the end. */
export function watchConsole(page: Page): { expectClean(): void } {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      problems.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return { expectClean: () => expect(problems).toEqual([]) };
}
