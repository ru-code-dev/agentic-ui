/**
 * Chakra-only reference page: the same snippets in a stock ChakraProvider (full CSSReset, global
 * styles, `:root` variables) with no playground CSS. The e2e pixel-parity check compares the
 * scoped preview against it, so this page deliberately does not use UiKitProvider.
 */
import { ChakraProvider, extendTheme } from "@chakra-ui/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { componentExamples, type Example } from "../examples.ts";
import { RuntimeSurfaces } from "../preview/runtime-surfaces.tsx";
import { useStaticRuntime } from "../preview/use-static-runtime.ts";

const theme = extendTheme({ config: { initialColorMode: "dark", useSystemColorMode: false } });

function ReferenceSnippet({ example }: { example: Example }) {
  const runtime = useStaticRuntime(example.messages);
  return (
    <div data-testid={`reference-${example.name}`} style={{ width: 480 }}>
      {runtime === undefined ? null : <RuntimeSurfaces runtime={runtime} />}
    </div>
  );
}

// `?component=Text` renders one snippet at the top of the page, so it starts on a whole pixel.
const only = new URLSearchParams(location.search).get("component");
const selected = componentExamples.filter((example) => only === null || example.name === only);

const container = document.getElementById("root");
if (container === null) throw new Error("#root is missing from reference.html");
createRoot(container).render(
  <StrictMode>
    <ChakraProvider theme={theme}>
      {selected.map((example) => (
        <ReferenceSnippet key={example.name} example={example} />
      ))}
    </ChakraProvider>
  </StrictMode>,
);
