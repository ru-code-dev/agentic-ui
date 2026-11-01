// A4-13 fixture: both forms are errors (agentic-ui/no-random-uuid).
export const a = crypto.randomUUID();
export const b = globalThis.crypto["randomUUID"]();
