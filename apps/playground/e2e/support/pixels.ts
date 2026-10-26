import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const screenshotsDir = fileURLToPath(
  new URL("../../../../docs/screenshots/spike/", import.meta.url),
);

/** Decodes a PNG and crops `inset` pixels from every side. */
export function decode(buffer: Buffer, inset = 0): PNG {
  const source = PNG.sync.read(buffer);
  if (inset === 0) return source;
  const cropped = new PNG({ width: source.width - 2 * inset, height: source.height - 2 * inset });
  PNG.bitblt(source, cropped, inset, inset, cropped.width, cropped.height, 0, 0);
  return cropped;
}

/** Number of pixels that differ between two equally sized images (pixelmatch, threshold 0.1). */
export function differingPixels(a: PNG, b: PNG): number {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`size differs: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  return pixelmatch(a.data, b.data, undefined, a.width, a.height, { threshold: 0.1 });
}

/** Saves a human-browsable screenshot under docs/screenshots/spike. */
export function saveScreenshot(name: string, buffer: Buffer): void {
  mkdirSync(screenshotsDir, { recursive: true });
  writeFileSync(`${screenshotsDir}${name}.png`, buffer);
}
