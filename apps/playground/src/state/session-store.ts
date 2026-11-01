import { create } from "zustand";
import type { ErrorSource } from "../preview/channel.ts";

export interface LoggedEvent {
  readonly id: number;
  readonly time: string;
  readonly kind: "action" | "reply";
  readonly surfaceId: string;
  readonly name: string;
  readonly context: unknown;
  readonly dataModel: unknown;
}

export interface PreviewError {
  readonly id: number;
  readonly source: ErrorSource;
  readonly message: string;
}

interface SessionState {
  readonly events: readonly LoggedEvent[];
  readonly previewErrors: readonly PreviewError[];
  readonly dataModels: Readonly<Record<string, unknown>>;
  readonly revision: number;
  readonly renderedRevision: number;
  /** PG-28: build id of a preview document from another build that posted to the channel. */
  readonly otherBuild: string | undefined;
  logEvent(event: Omit<LoggedEvent, "id">): void;
  clearEvents(): void;
  reportError(source: ErrorSource, message: string): void;
  clearPreviewErrors(): void;
  setDataModel(surfaceId: string, value: unknown): void;
  bumpRevision(): number;
  markRendered(revision: number): void;
  noteOtherBuild(build: string): void;
}

let sequence = 0;

/** Live session state (not persisted): events, preview errors, data models, render status. */
export const useSession = create<SessionState>()((set, get) => ({
  events: [],
  previewErrors: [],
  dataModels: {},
  revision: 0,
  renderedRevision: -1,
  otherBuild: undefined,
  logEvent: (event) =>
    set((state) => ({ events: [...state.events, { ...event, id: ++sequence }] })),
  clearEvents: () => set({ events: [] }),
  reportError: (source, message) =>
    set((state) =>
      state.previewErrors.some((error) => error.source === source && error.message === message)
        ? state
        : { previewErrors: [...state.previewErrors, { id: ++sequence, source, message }] },
    ),
  clearPreviewErrors: () => set({ previewErrors: [], dataModels: {} }),
  setDataModel: (surfaceId, value) =>
    set((state) => ({ dataModels: { ...state.dataModels, [surfaceId]: value } })),
  bumpRevision: () => {
    const revision = get().revision + 1;
    set({ revision });
    return revision;
  },
  markRendered: (renderedRevision) => set({ renderedRevision }),
  noteOtherBuild: (otherBuild) => set({ otherBuild }),
}));
