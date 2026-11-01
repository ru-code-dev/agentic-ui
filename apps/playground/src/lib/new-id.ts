/**
 * A4-13: a random RFC 4122 v4 id that also works outside a secure context. `crypto.randomUUID` exists
 * only on https and localhost; the playground served over plain http from a LAN host (DEPLOY.md
 * nginx without TLS) has only `crypto.getRandomValues`. Direct `randomUUID` calls are a lint error
 * (agentic-ui/no-random-uuid) everywhere but here.
 */
export interface RandomSource {
  getRandomValues(array: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
  randomUUID?: () => string;
}

export function newId(source: RandomSource = crypto): string {
  // oxlint-disable-next-line agentic-ui/no-random-uuid -- the one guarded call site (A4-13)
  if (typeof source.randomUUID === "function") return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
