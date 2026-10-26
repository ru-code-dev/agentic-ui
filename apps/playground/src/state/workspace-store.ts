import { create } from "zustand";
import { persist } from "zustand/middleware";
import { compositions, findExample, mockRulePresets, type Example } from "../examples.ts";

export interface MockRule {
  readonly id: string;
  readonly event: string;
  /** Reply messages as JSON text (edited in place). */
  readonly messages: string;
  readonly enabled: boolean;
}

interface WorkspaceState {
  readonly source: string;
  readonly selectedId: string | undefined;
  readonly deviceId: string;
  readonly landscape: boolean;
  readonly fitToPane: boolean;
  readonly mockRules: readonly MockRule[];
  readonly promptExamples: number;
  setSource(source: string): void;
  select(example: Example): void;
  resetToSelected(): void;
  setDevice(deviceId: string): void;
  toggleLandscape(): void;
  toggleFit(): void;
  addRule(rule?: Partial<MockRule>): void;
  updateRule(id: string, patch: Partial<MockRule>): void;
  deleteRule(id: string): void;
  loadPresets(): void;
  setPromptExamples(count: number): void;
  resetAll(): void;
}

const format = (messages: readonly unknown[]) => JSON.stringify(messages, null, 2);
const first = compositions[0] as Example;
const presetRules = (): MockRule[] =>
  mockRulePresets.map((preset) => ({
    id: preset.id,
    event: preset.event,
    messages: format(preset.messages),
    enabled: true,
  }));

const initial = {
  source: format(first.messages),
  selectedId: first.id,
  deviceId: "iphone-15",
  landscape: false,
  fitToPane: true,
  mockRules: presetRules(),
  promptExamples: 5,
};

/** Workspace state persisted in localStorage (PG-15): editor, selection, device, mock rules. */
export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      ...initial,
      setSource: (source) => set({ source }),
      select: (example) => set({ selectedId: example.id, source: format(example.messages) }),
      resetToSelected: () => {
        const example = findExample(get().selectedId);
        if (example !== undefined) set({ source: format(example.messages) });
      },
      setDevice: (deviceId) => set({ deviceId }),
      toggleLandscape: () => set((state) => ({ landscape: !state.landscape })),
      toggleFit: () => set((state) => ({ fitToPane: !state.fitToPane })),
      addRule: (rule) =>
        set((state) => ({
          mockRules: [
            ...state.mockRules,
            { id: crypto.randomUUID(), event: "", messages: "[]", enabled: true, ...rule },
          ],
        })),
      updateRule: (id, patch) =>
        set((state) => ({
          mockRules: state.mockRules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
        })),
      deleteRule: (id) =>
        set((state) => ({ mockRules: state.mockRules.filter((rule) => rule.id !== id) })),
      loadPresets: () =>
        set((state) => ({
          mockRules: [
            ...state.mockRules.filter((rule) => !mockRulePresets.some((p) => p.id === rule.id)),
            ...presetRules(),
          ],
        })),
      setPromptExamples: (promptExamples) => set({ promptExamples }),
      resetAll: () => set({ ...initial, mockRules: presetRules() }),
    }),
    {
      name: "agentic-ui-playground",
      version: 1,
      partialize: ({
        source,
        selectedId,
        deviceId,
        landscape,
        fitToPane,
        mockRules,
        promptExamples,
      }) => ({
        source,
        selectedId,
        deviceId,
        landscape,
        fitToPane,
        mockRules,
        promptExamples,
      }),
    },
  ),
);
