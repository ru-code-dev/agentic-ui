/** Shared fixtures of the Agent page unit tests (not part of the app bundle: only tests import it). */
import { CATALOG_ID } from "@agentic-ui/ui-kit-one-catalog";
import {
  AgentRequestError,
  CONTRACT_VERSION,
  createAgentClient,
  type AgentClient,
  type Outcome,
} from "@agentic-ui/a2ui-react/core";
import { vi } from "vite-plus/test";
import { AGENT_API_BASE } from "./endpoint.ts";

/** The page's HTTP client as the Agent page makes it (the package client at the page's endpoint, SV-C12). */
export const httpAgentApi = createAgentClient({ endpoint: AGENT_API_BASE });

/** A surface the page's validator accepts (createSurface + a root Text). */
export const surface = (id: string, text = "Готово") => [
  { version: "v0.9", createSurface: { surfaceId: id, catalogId: CATALOG_ID } },
  {
    version: "v0.9",
    updateComponents: { surfaceId: id, components: [{ id: "root", component: "Text", text }] },
  },
];

/** An HTTP error answer as the client reports it (message `<status> <title>`). */
export const httpFailure = (status: number, title: string, request = "POST /api/prompt") =>
  new AgentRequestError({
    kind: "http",
    request,
    httpStatus: status,
    title,
    details: [],
    excerpt: "",
  });

/** A body as the server sends it: with this page's contract version (DEC-056). */
export const versioned = <T extends object>(body: T) => ({
  contractVersion: CONTRACT_VERSION,
  ...body,
});

/** An ok outcome (tests). */
export const outcome = (over: Partial<Outcome> = {}): Outcome => ({
  chatId: "x",
  status: "ok",
  messages: surface("s1"),
  text: "",
  fallback: false,
  errors: [],
  attempts: 1,
  durationMs: 1,
  ...over,
});

/** An AgentClient whose calls answer `outcome()` unless overridden (tests). */
export const fakeApi = (over: Partial<AgentClient> = {}): AgentClient => ({
  prompt: vi.fn(async () => outcome()),
  action: vi.fn(async () => outcome()),
  cancel: vi.fn(async () => true),
  progress: vi.fn(async () => undefined),
  models: vi.fn(async () => undefined),
  setModel: vi.fn(async (_chat: string, model: string) => model),
  ...over,
});
