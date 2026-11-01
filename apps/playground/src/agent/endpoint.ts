import { agentUrl as baseUrl } from "@agentic-ui/a2ui-react/core";

/**
 * SV-C12: the one place that names the agent server. A path (`/api`, `/some-path/api`: same
 * origin, routed by nginx; `vp dev` / `vp preview` proxy `/api` to AGENT_SERVER_URL) or an
 * absolute URL (`https://someserver.com/agent-api`: the server must list this origin in
 * `server.cors_origins`). Same value as the server's `server.base_path` (SERVER-CONTRACT.md).
 */
export const AGENT_API_BASE = "/api";

/** `{base}/<endpoint>` with optional query parameters, for a path or an absolute base. */
export const agentUrl = (
  endpoint: string,
  query: Readonly<Record<string, string>> = {},
  base: string = AGENT_API_BASE,
): string => baseUrl(base, endpoint, query);
