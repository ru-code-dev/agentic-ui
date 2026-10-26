# Step 01 spike screenshots

Written by the playground e2e suite (`pnpm e2e`) against the production build.

| File                                                           | What it shows                                                                       | Test                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| parity-text-reference.png / parity-text-scoped.png             | Text snippet: Chakra-only page vs scoped kit in the Tailwind playground (0 px diff) | apps/playground/e2e/scoped-parity.spec.ts  |
| parity-button-reference.png / parity-button-scoped.png         | Button snippet, same comparison                                                     | apps/playground/e2e/scoped-parity.spec.ts  |
| parity-modal-reference.png / parity-modal-scoped.png           | Modal trigger, same comparison                                                      | apps/playground/e2e/scoped-parity.spec.ts  |
| parity-modal-open-reference.png / parity-modal-open-scoped.png | Open Modal dialog, same comparison                                                  | apps/playground/e2e/scoped-parity.spec.ts  |
| components-modal-open.png                                      | `/components`: scoped Modal open over the playground shell                          | apps/playground/e2e/scoped-parity.spec.ts  |
| workspace-device-modal-open.png                                | `/`: Chakra Modal open inside the device iframe (`/preview`)                        | apps/playground/e2e/device-preview.spec.ts |
| preview-new-tab.png                                            | `/preview` in a new tab, synced over the BroadcastChannel                           | apps/playground/e2e/device-preview.spec.ts |
| workspace-validation-error.png                                 | In-browser `validatePayload` error for an unknown component                         | apps/playground/e2e/workspace.spec.ts      |
| workspace-code-shiki.png                                       | Shiki-highlighted JSON in the production build                                      | apps/playground/e2e/workspace.spec.ts      |
