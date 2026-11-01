#!/usr/bin/env node
/**
 * Deterministic ACP agent for the Agent page e2e (P8, no LLM). The real agent server spawns one
 * process per chat (SV-C19) and talks ACP over stdio; the scenario is picked by a tag in the
 * chat's first prompt and sticks for the process:
 *   (none)     valid UI after ~0.4 s
 *   #repair    invalid first reply, then (after AGENT_E2E_REPAIR_MS) the valid UI on the repair turn
 *   #fallback  every reply invalid → the server's fallback surface
 *   #flaky     the first 4 replies invalid (fallback), the next ones valid (Повторить works)
 *   #hold      never answers until session/cancel
 * A session/cancel is acknowledged after AGENT_E2E_CANCEL_MS (default 500 ms), as a real agent
 * stopping its turn takes a moment: the page's «Отменяю…» state is then observable, not a race.
 * An action turn is answered with an updateDataModel built from the data model it carries.
 * `session/new` offers the two allowed presets (SV-C17) as its model list (SV-C25).
 */
import { createInterface } from "node:readline";

const CATALOG = "urn:agentic-ui:catalog:ui-kit-one:v1";
const SURFACE = "e2e-form";
const REPAIR_MS = Number(process.env.AGENT_E2E_REPAIR_MS ?? 2500);
const CANCEL_MS = Number(process.env.AGENT_E2E_CANCEL_MS ?? 500);
const MODELS = {
  availableModels: [
    {
      modelId: "model-a(openai)",
      name: "model-a",
      description: "Model A (test endpoint)",
    },
    { modelId: "model-b(openai)", name: "model-b", description: null },
  ],
  currentModelId: "model-a(openai)",
};

/**
 * The valid UI; `broken` adds a child id that is never defined (a validation error). It starts with a
 * deleteSurface (a no-op for a surface the chat does not show), so a second prompt in the same chat
 * replaces the form instead of creating a shown surface again (SV-C28: that is invalid).
 */
function ui(broken) {
  return [
    { version: "v0.9", deleteSurface: { surfaceId: SURFACE } },
    {
      version: "v0.9",
      createSurface: { surfaceId: SURFACE, catalogId: CATALOG, sendDataModel: true },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: SURFACE,
        components: [
          {
            id: "root",
            component: "Flex",
            direction: "column",
            gap: "3",
            children: broken
              ? ["title", "name", "send", "result", "missing"]
              : ["title", "name", "send", "result"],
          },
          { id: "title", component: "Heading", text: "Заявка на карту", size: "md" },
          { id: "name", component: "Input", label: "Имя", value: { path: "/form/name" } },
          {
            id: "send",
            component: "Button",
            label: "Отправить заявку",
            action: { event: { name: "form.submit", context: { source: "e2e" } } },
          },
          { id: "result", component: "Text", text: { path: "/result" } },
        ],
      },
    },
    {
      version: "v0.9",
      updateDataModel: {
        surfaceId: SURFACE,
        path: "/",
        value: { form: { name: "" }, result: "Заявка не отправлена" },
      },
    },
  ];
}

const block = (messages, prose) =>
  `${prose}\n<a2ui-json>\n${JSON.stringify(messages)}\n</a2ui-json>`;

function actionReply(text) {
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const name = JSON.parse(json).action?.dataModel?.form?.name ?? "";
  const value = `Заявка принята: ${name}`;
  return block(
    [{ version: "v0.9", updateDataModel: { surfaceId: SURFACE, path: "/result", value } }],
    "Готово.",
  );
}

let scenario;
let replies = 0;
let cancel;

const write = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const chunk = (sessionId, text) =>
  write({
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
    },
  });
const sleep = (ms) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    cancel = () => {
      clearTimeout(timer);
      resolve(true);
    };
  });

/** The reply text for this turn, or undefined to wait for a cancel. */
async function answer(text) {
  scenario ??= /#(repair|fallback|flaky|hold)\b/.exec(text)?.[1] ?? "valid";
  replies += 1;
  if (text.includes("The user triggered an action")) return { delay: 300, text: actionReply(text) };
  if (scenario === "hold") return { delay: Infinity };
  const broken =
    scenario === "fallback" ||
    (scenario === "repair" && replies === 1) ||
    (scenario === "flaky" && replies <= 4);
  const delay = scenario === "repair" && replies === 2 ? REPAIR_MS : 400;
  return { delay, text: block(ui(broken), broken ? "Черновик." : "Интерфейс готов.") };
}

async function prompt(id, params) {
  const text = (params.prompt ?? []).map((part) => part.text ?? "").join("\n");
  const reply = await answer(text);
  const cancelled = await sleep(reply.delay === Infinity ? 2 ** 31 - 1 : reply.delay);
  if (!cancelled && reply.text !== undefined) chunk(params.sessionId, reply.text);
  write({ jsonrpc: "2.0", id, result: { stopReason: cancelled ? "cancelled" : "end_turn" } });
}

const RESULTS = {
  initialize: {
    protocolVersion: 1,
    agentInfo: { name: "agentic-ui-e2e-agent", version: "0" },
    authMethods: [],
    agentCapabilities: { loadSession: false },
  },
  "session/new": { sessionId: `e2e-${process.pid}`, models: MODELS },
  "session/set_model": {},
  "session/set_mode": {},
  "session/set_config_option": { configOptions: [] },
  authenticate: {},
};

for await (const line of createInterface({ input: process.stdin })) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    continue;
  }
  if (message.method === "session/cancel") {
    const stop = cancel;
    setTimeout(() => stop?.(), CANCEL_MS);
  } else if (message.method === "session/prompt") void prompt(message.id, message.params ?? {});
  else if (message.id !== undefined && message.method !== undefined) {
    const result = RESULTS[message.method];
    write(
      result === undefined
        ? {
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32601, message: `Method not found: ${message.method}` },
          }
        : { jsonrpc: "2.0", id: message.id, result },
    );
  }
}
// A5-07: the client is gone (stdin closed): exit, even with a #hold turn's timer pending (no orphan agent).
process.exit(0);
