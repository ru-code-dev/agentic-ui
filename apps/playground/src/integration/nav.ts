/** The Integration section's pages in sidebar order (light: the sidebar ships in the entry chunk). */
export const INTEGRATION_NAV = [
  { slug: "full-chat", title: "Полный чат" },
  { slug: "follow", title: "Follow" },
  { slug: "single-panel", title: "Одна панель" },
  { slug: "byo-chat", title: "Свой чат" },
  { slug: "headless", title: "Headless" },
  { slug: "minimal-server", title: "Минимальный сервер" },
  { slug: "surface-history", title: "История поверхностей" },
  { slug: "orchestrator", title: "Оркестратор (авто-UI)" },
] as const;

export type IntegrationSlug = (typeof INTEGRATION_NAV)[number]["slug"];

export const titleOf = (slug: IntegrationSlug): string =>
  INTEGRATION_NAV.find((entry) => entry.slug === slug)?.title ?? slug;
