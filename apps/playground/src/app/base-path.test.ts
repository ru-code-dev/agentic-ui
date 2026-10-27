import { afterEach, describe, expect, it, vi } from "vitest";

async function load(base: string) {
  vi.stubEnv("BASE_URL", base);
  vi.resetModules();
  return import("./base-path.ts");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("base path", () => {
  it("is a no-op at the domain root", async () => {
    const { toAppPath, toUrlPath, publicUrl } = await load("/");
    expect(toUrlPath("/components")).toBe("/components");
    expect(toAppPath("/llm-context")).toBe("/llm-context");
    expect(publicUrl("tokenizers/qwen2.5/tokenizer.json")).toBe(
      "/tokenizers/qwen2.5/tokenizer.json",
    );
  });

  it("adds and strips a subfolder base", async () => {
    const { toAppPath, toUrlPath, publicUrl } = await load("/agentic-ui/");
    expect(toUrlPath("/preview")).toBe("/agentic-ui/preview");
    expect(toAppPath("/agentic-ui/components/Button")).toBe("/components/Button");
    expect(toAppPath("/agentic-ui")).toBe("/");
    expect(toAppPath("/agentic-ui/")).toBe("/");
    expect(toAppPath("/agentic-uix/components")).toBe("/agentic-uix/components");
    expect(publicUrl("tokenizers/qwen2.5/tokenizer.json")).toBe(
      "/agentic-ui/tokenizers/qwen2.5/tokenizer.json",
    );
  });
});
