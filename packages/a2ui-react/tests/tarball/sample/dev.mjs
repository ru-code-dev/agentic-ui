// `node dev.mjs`: the sample on the Vite dev server (React development build); prints its URL.
import { createServer } from "vite";

const server = await createServer({
  root: import.meta.dirname,
  logLevel: "silent",
  server: { port: 0, host: "127.0.0.1" },
});
await server.listen();
console.log(server.resolvedUrls?.local[0]);
