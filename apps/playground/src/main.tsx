import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { toAppPath } from "./app/base-path.ts";

const container = document.getElementById("root");
if (container === null) throw new Error("#root is missing from index.html");
const root = createRoot(container);

if (toAppPath(location.pathname) === "/preview") {
  // The preview document belongs to the kit: no playground styles, no dark-shell class.
  document.documentElement.classList.remove("dark");
  const { PreviewPage } = await import("./preview/preview-page.tsx");
  root.render(
    <StrictMode>
      <PreviewPage />
    </StrictMode>,
  );
} else {
  const { App } = await import("./app/app.tsx");
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
