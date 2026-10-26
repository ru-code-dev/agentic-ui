/**
 * Encodes A2UI messages into a URL hash (deflate-raw + base64url) so a `/preview` URL restores the
 * preview without its opener.
 */
async function pipe(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function encodeMessagesHash(messages: readonly unknown[]): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(messages));
  return toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

export async function decodeMessagesHash(hash: string): Promise<readonly unknown[] | undefined> {
  const payload = hash.replace(/^#/, "");
  if (payload === "") return undefined;
  const json = await pipe(fromBase64Url(payload), new DecompressionStream("deflate-raw"));
  return JSON.parse(new TextDecoder().decode(json)) as readonly unknown[];
}
