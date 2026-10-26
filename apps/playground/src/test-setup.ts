import { cleanup } from "@testing-library/react";
import { afterEach } from "vite-plus/test";

// jsdom has no ResizeObserver; components that measure themselves only need it to exist.
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= NoopResizeObserver;

// Testing Library registers its automatic cleanup only with test globals, which this suite does not use.
afterEach(cleanup);
