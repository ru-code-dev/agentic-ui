/**
 * `@agentic-ui/a2ui-react/core` (SV-C26 layer 1): the headless core, no React and no DOM (Node 18+, workers,
 * server components). Named exports only (DEC-050).
 */
export {
  CANCEL_TIMEOUT_MS,
  MODEL_TIMEOUT_MS,
  createAgentClient,
  type ActionRequest,
  type AgentClient,
  type AgentClientOptions,
  type ModelInfo,
  type Models,
  type OptionalEndpoint,
  type Outcome,
  type Progress,
} from "./client.ts";
export {
  CANCEL_GRACE_MS,
  RETRY_EVENT,
  createA2UIChat,
  type A2UIChat,
  type A2UIChatOptions,
} from "./chat.ts";
export type { FiredAction } from "./chat-results.ts";
export type {
  ChatRequest,
  ChatState,
  ChatTurn,
  ModelChoice,
  TurnResult,
  TurnState,
  Working,
} from "./chat-state.ts";
export { CONTRACT_VERSION } from "./contract-version.ts";
export { extractA2UI, type Extraction } from "./extract.ts";
export { agentUrl } from "./http.ts";
export { REPAIR_DELAY_MS, createRepairs, repairText } from "./repair.ts";
export {
  AgentRequestError,
  EXCERPT_CHARS,
  bodyProblem,
  excerptOf,
  type Endpoint,
  type ProblemKind,
  type ResponseProblem,
} from "./responses.ts";
export {
  createSurfaceLog,
  type ApplyResult,
  type SurfaceChange,
  type SurfaceLog,
} from "./surfaces.ts";
export {
  createChatSurfaces,
  validateMessages,
  type ChatSurfaces,
  type MergeVerdict,
  type ValidationResult,
} from "@agentic-ui/ui-kit-one-catalog";
