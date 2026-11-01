// The consumer of the packed tarball (SV-C26): its own surfaces (useA2UISurfaces) and the default chat on /api.
import { createElement as h, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  A2UIChat,
  A2UIKitProvider,
  A2UISurface,
  useA2UIChat,
  useA2UISurfaces,
} from "@agentic-ui/a2ui-react";
import { CONTRACT_VERSION, validateMessages } from "@agentic-ui/a2ui-react/core";

const CATALOG = "urn:agentic-ui:catalog:ui-kit-one:v1";
const STATIC = [
  { version: "v0.9", createSurface: { surfaceId: "static", catalogId: CATALOG } },
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: "static",
      components: [{ id: "root", component: "Text", text: "Статика" }],
    },
  },
];

function OwnSurfaces() {
  const { surfaces, apply } = useA2UISurfaces();
  useEffect(() => {
    apply(STATIC);
  }, [apply]);
  return h(
    A2UIKitProvider,
    { mode: "scoped" },
    surfaces.map((surface) => h(A2UISurface, { key: surface.id, surface })),
  );
}

function App() {
  const chat = useA2UIChat({ endpoint: "/api", chatId: "sample" });
  return h(
    "main",
    null,
    h("p", { "data-testid": "version" }, `${CONTRACT_VERSION} ${validateMessages(STATIC).valid}`),
    h(OwnSurfaces),
    h(A2UIChat, { chat, placement: "follow" }),
  );
}

createRoot(document.getElementById("root")).render(h(App));
