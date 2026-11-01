import { describe, expect, it } from "vite-plus/test";
import { AGENT_API_BASE, agentUrl } from "./endpoint.ts";

describe("agent endpoint constant [SV-C12]", () => {
  it("defaults to the server's default base path", () => {
    expect(AGENT_API_BASE).toBe("/api");
    expect(agentUrl("prompt")).toBe("/api/prompt");
  });

  it("joins a path base or an absolute URL base, with an encoded query", () => {
    expect(agentUrl("progress", { chatId: "a b/ц" }, "/some-path/api/")).toBe(
      "/some-path/api/progress?chatId=a+b%2F%D1%86",
    );
    expect(agentUrl("/models", {}, "https://someserver.com/agent-api")).toBe(
      "https://someserver.com/agent-api/models",
    );
  });
});
