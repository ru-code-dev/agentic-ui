import { describe, expect, it } from "vite-plus/test";
import { BUILD_ID, openPreviewChannel, type PreviewChannelMessage } from "./channel.ts";
import { newId } from "../lib/new-id.ts";

const next = (channel: ReturnType<typeof openPreviewChannel>) =>
  new Promise<PreviewChannelMessage>((resolve) => {
    const stop = channel.subscribe((message) => {
      stop();
      resolve(message);
    });
  });

describe("preview channel [PG-24]", () => {
  it("carries app → preview and preview → app messages between documents", async () => {
    const name = `test-${newId()}`;
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

describe("stale preview guard [PG-28]", () => {
  it("drops messages of another build and of builds without an id, and reports them", async () => {
    const name = `test-${newId()}`;
    const current = openPreviewChannel(name, "build-new");
    const old = openPreviewChannel(name, "build-old");
    const raw = new BroadcastChannel(name);
    const received: PreviewChannelMessage[] = [];
    const others: string[] = [];
    current.subscribe(
      (message) => received.push(message),
      (build) => others.push(build),
    );

    old.post({ type: "error", previewId: "old", source: "runtime", message: "expected string" });
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel.postMessage has no targetOrigin parameter
    raw.postMessage({ type: "hello", previewId: "pre-PG-28" });
    const same = openPreviewChannel(name, "build-new");
    const arrived = next(current);
    same.post({ type: "hello", previewId: "same" });
    expect(await arrived).toEqual({ type: "hello", previewId: "same" });

    expect(received).toEqual([{ type: "hello", previewId: "same" }]);
    expect(others).toEqual(["build-old", "unknown"]);
    for (const channel of [current, old, same]) channel.close();
    raw.close();
  });

  it("stamps this build's id (vite define) on every message", () => {
    expect(BUILD_ID).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });
});
