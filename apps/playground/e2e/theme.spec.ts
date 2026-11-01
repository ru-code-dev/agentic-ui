import { expect, test, type Frame, type Page } from "@playwright/test";
import { watchConsole } from "./support/console.ts";
import { ROUTES } from "./support/routes.ts";

interface ThemeProbe {
  readonly htmlDark: boolean;
  readonly colorScheme: string;
  readonly background: number;
  /** The effective background is opaque (not a transparent fallback or a running transition). */
  readonly opaqueBackground: boolean;
  readonly text: number;
  readonly lightSurfaces: readonly string[];
}

/**
 * Runs in the page: resolves any CSS colour (oklch, color-mix, …) through a 1×1 canvas and returns
 * WCAG relative luminances of the effective body background and text, plus every opaque surface
 * covering more than 15 % of the viewport that is not dark.
 */
function probeTheme(): ThemeProbe {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
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
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate serialises probeTheme alone, so its helpers must live inside it
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (css: string) => {
    const { r, g, b } = rgba(css);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const opaque = (css: string) => css !== "transparent" && rgba(css).a > 0.99;
  const html = document.documentElement;
  const { body } = document;
  const bodyBackground = getComputedStyle(body).backgroundColor;
  const background = opaque(bodyBackground)
    ? bodyBackground
    : getComputedStyle(html).backgroundColor;

  const viewport = window.innerWidth * window.innerHeight;
  const lightSurfaces: string[] = [];
  for (const element of document.querySelectorAll("body *")) {
    const style = getComputedStyle(element);
    if (style.visibility !== "visible" || style.display === "none") continue;
    if (!opaque(style.backgroundColor)) continue;
    const box = element.getBoundingClientRect();
    const width = Math.min(box.right, window.innerWidth) - Math.max(box.left, 0);
    const height = Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0);
    if (width <= 0 || height <= 0 || (width * height) / viewport <= 0.15) continue;
    const value = luminance(style.backgroundColor);
    if (value >= 0.1) {
      const id = element.getAttribute("data-testid") ?? element.className.toString().slice(0, 60);
      lightSurfaces.push(
        `${element.tagName.toLowerCase()} ${id} ${style.backgroundColor} ${value}`,
      );
    }
  }
  return {
    htmlDark: html.classList.contains("dark"),
    colorScheme: getComputedStyle(html).colorScheme,
    background: luminance(background),
    opaqueBackground: opaque(background),
    text: luminance(getComputedStyle(body).color),
    lightSurfaces,
  };
}

/** The device preview iframe as a Frame (its own document). */
async function deviceFrame(page: Page): Promise<Frame> {
  const frame = await (await page.getByTestId("device-frame").elementHandle())?.contentFrame();
  if (frame === null || frame === undefined) throw new Error("device frame has no document");
  return frame;
}

test.describe("[PG-19] every route is dark-only", () => {
  for (const [path, open] of ROUTES) {
    test(`${path} has a dark document, dark surfaces, light text and a visible focus ring [PG-19]`, async ({
      page,
    }) => {
      const console = watchConsole(page);
      await open(page);
      await expect.poll(async () => (await page.evaluate(probeTheme)).opaqueBackground).toBe(true);
      const probe = await page.evaluate(probeTheme);
      expect(probe.htmlDark).toBe(true);
      expect(probe.colorScheme).toBe("dark");
      expect(probe.background).toBeLessThan(0.05);
      expect(probe.text).toBeGreaterThan(0.7);
      expect(probe.lightSurfaces).toEqual([]);

      if (path === "/") {
        const frame = await deviceFrame(page);
        // Chakra animates the body background in; wait until it has settled to an opaque colour.
        await expect
          .poll(async () => (await frame.evaluate(probeTheme)).opaqueBackground)
          .toBe(true);
        const preview = await frame.evaluate(probeTheme);
        expect(preview.background).toBeLessThan(0.05);
        expect(preview.lightSurfaces).toEqual([]);
      }

      await page.locator("body").click({ position: { x: 1, y: 1 } });
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const element = document.activeElement;
        if (element === null || element === document.body) return undefined;
        const style = getComputedStyle(element);
        return { outline: style.outlineStyle, shadow: style.boxShadow };
      });
      expect(focus).toBeDefined();
      expect(focus?.outline !== "none" || focus?.shadow !== "none").toBe(true);
      console.expectClean();
    });
  }
});
