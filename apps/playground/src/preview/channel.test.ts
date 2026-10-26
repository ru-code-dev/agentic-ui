import { describe, expect, it } from "vite-plus/test";
import { openPreviewChannel, type PreviewChannelMessage } from "./channel.ts";

const next = (channel: ReturnType<typeof openPreviewChannel>) =>
  new Promise<PreviewChannelMessage>((resolve) => {
    const stop = channel.subscribe((message) => {
      stop();
      resolve(message);
    });
  });

describe("preview channel (PG-24)", () => {
  it("carries app → preview and preview → app messages between documents", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const app = openPreviewChannel(name);
    const preview = openPreviewChannel(name);

    const rendered = next(preview);
    app.post({ type: "render", messages: [{ version: "v0.9" }], revision: 3 });
    expect(await rendered).toEqual({
      type: "render",
      messages: [{ version: "v0.9" }],
      revision: 3,
    });

    const reported = next(app);
    preview.post({
      type: "dataModel",
      previewId: "p1",
      surfaceId: "login",
      value: { form: { email: "a@b.ru" } },
    });
    expect(await reported).toMatchObject({
      type: "dataModel",
      surfaceId: "login",
      value: { form: { email: "a@b.ru" } },
    });

    const action = next(app);
    preview.post({
      type: "action",
      previewId: "p1",
      name: "login.submit",
      surfaceId: "login",
      context: {},
      dataModel: {},
      timestamp: "t",
    });
    expect(await action).toMatchObject({ type: "action", name: "login.submit" });

    app.close();
    preview.close();
  });
});
