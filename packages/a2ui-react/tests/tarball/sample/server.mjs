// Serves the built sample and a scripted agent server: /api/prompt creates a surface, /api/action updates it.
// The contract version comes from the INSTALLED package's core entry (it runs in Node, no browser).
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";

export async function serve(dir) {
  const { CONTRACT_VERSION } = await import(
    join(dir, "node_modules/@agentic-ui/a2ui-react/dist/core.js")
  );
  const surface = (text) => [
    {
      version: "v0.9",
      createSurface: {
        surfaceId: "s1",
        catalogId: CONTRACT_VERSION.split(" ")[0],
        sendDataModel: true,
      },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "s1",
        components: [
          { id: "root", component: "Flex", direction: "column", children: ["t", "b"] },
          { id: "t", component: "Text", text: { path: "/greeting" } },
          { id: "b", component: "Button", label: "Ещё", action: { event: { name: "more" } } },
        ],
      },
    },
    { version: "v0.9", updateDataModel: { surfaceId: "s1", path: "/", value: { greeting: text } } },
  ];
  const outcome = (chatId, text, messages) => ({
    chatId,
    status: "ok",
    messages,
    text,
    fallback: false,
    errors: [],
    attempts: 1,
    durationMs: 1,
    turnId: null,
    contractVersion: CONTRACT_VERSION,
  });
  const server = createServer(async (request, response) => {
    const send = (status, body, type = "application/json") => {
      response.writeHead(status, { "Content-Type": type });
      response.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    const url = new URL(request.url, "http://x");
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body = raw === "" ? {} : JSON.parse(raw);
      if (url.pathname === "/api/prompt")
        return send(200, outcome(body.chatId, "Вот интерфейс.", surface("Привет из агента")));
      if (url.pathname === "/api/action")
        return send(
          200,
          outcome(body.chatId, `Действие ${body.event.name}`, [
            {
              version: "v0.9",
              updateDataModel: { surfaceId: "s1", path: "/greeting", value: "Обновлено" },
            },
          ]),
        );
      return send(404, "Not Found", "text/plain"); // a minimal server: no optional endpoints
    }
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
      send(
        200,
        await readFile(join(dir, "dist", path)),
        types[extname(path)] ?? "application/octet-stream",
      );
    } catch {
      send(404, "Not Found", "text/plain");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}
