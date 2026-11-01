import type { Surface } from "@agentic-ui/a2ui-react";
import type { Connection } from "./connection.ts";

/** What every Integration demo gets from the page (the rest of a demo is plain consumer code). */
export interface DemoProps {
  /** Live: our agent server (dev proxy `/api`); Scripted: the built-in fake agent in the browser. */
  readonly connection: Connection;
  /** Playground only: the demo's live surfaces for the Data model tab. */
  readonly showSurfaces: (surfaces: readonly Surface[]) => void;
}
