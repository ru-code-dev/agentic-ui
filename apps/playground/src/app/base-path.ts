/**
 * Deployment base path (Vite `base`, set with `PLAYGROUND_BASE`, e.g. `/agentic-ui/`), without the
 * trailing slash; empty when served from the domain root. The app routes on base-free paths
 * (`/components`); only URLs that reach the browser carry the base.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** App path (`/components`) → URL path (`/agentic-ui/components`). */
export const toUrlPath = (appPath: string): string => `${BASE}${appPath}`;

/** URL path (`/agentic-ui/components`) → app path (`/components`); the bare base maps to `/`. */
export function toAppPath(urlPath: string): string {
  if (BASE === "" || !urlPath.startsWith(BASE)) return urlPath;
  const rest = urlPath.slice(BASE.length);
  if (rest === "") return "/";
  return rest.startsWith("/") ? rest : urlPath;
}

/** URL of a file in `public/` (e.g. `tokenizers/qwen2.5/tokenizer.json`). */
export const publicUrl = (file: string): string => `${import.meta.env.BASE_URL}${file}`;
