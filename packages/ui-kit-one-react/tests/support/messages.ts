/** Builders for A2UI v0.9 messages used across the renderer tests. */
export const CATALOG_ID = "urn:agentic-ui:catalog:ui-kit-one:v1";

export const surface = (surfaceId: string, sendDataModel = false) => ({
  version: "v0.9",
  createSurface: { surfaceId, catalogId: CATALOG_ID, sendDataModel },
});

export const components = (surfaceId: string, list: readonly object[]) => ({
  version: "v0.9",
  updateComponents: { surfaceId, components: list },
});

export const data = (surfaceId: string, path: string, value: unknown) => ({
  version: "v0.9",
  updateDataModel: { surfaceId, path, value },
});
