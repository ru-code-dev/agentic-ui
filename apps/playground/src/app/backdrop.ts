import { PAGE_BACKGROUND } from "@agentic-ui/ui-kit-one-react";
import type { CSSProperties } from "react";

/**
 * PG-29: the backdrop behind every kit preview (device frame, catalog cards, detail view) is the
 * kit's own page background, set once on the shell as this CSS variable (`bg-(--kit-page-bg)`).
 */
export const BACKDROP_VAR = "--kit-page-bg";

export const backdropStyle = { [BACKDROP_VAR]: PAGE_BACKGROUND } as CSSProperties;
