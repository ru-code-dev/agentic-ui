import type { ComponentType } from "react";
import { bankScript } from "./bank-script.ts";
import type { DemoProps } from "./demo-props.ts";
import { ByoChatDemo } from "./demos/byo-chat.tsx";
import { FollowDemo } from "./demos/follow.tsx";
import { FullChatDemo } from "./demos/full-chat.tsx";
import { HeadlessDemo } from "./demos/headless.tsx";
import { MinimalServerDemo } from "./demos/minimal-server.tsx";
import { OrchestratorDemo } from "./demos/orchestrator.tsx";
import { SinglePanelDemo } from "./demos/single-panel.tsx";
import { SurfaceHistoryDemo } from "./demos/surface-history.tsx";
import { titleOf, type IntegrationSlug } from "./nav.ts";

/** The demos' own source files as text (Vite raw import): the Code tab shows exactly what runs. */
const SOURCES = import.meta.glob<string>("./demos/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});
import type { Script } from "./scripted-server.ts";

/** One Integration page: its demo, the demo's own source (raw import: what runs is what is shown). */
export interface IntegrationPage {
  readonly slug: IntegrationSlug;
  readonly title: string;
  /** What the page shows and what to try (Russian UI). */
  readonly summary: string;
  /** What Live mode needs from the server. */
  readonly live: string;
  readonly Demo: ComponentType<DemoProps>;
  readonly file: string;
  readonly source: string;
  /** The Scripted mode's agent (a new one per chat). */
  readonly script: () => Script;
  /** false: the server has only /prompt and /action (Minimal server). */
  readonly optional: boolean;
}

const LIVE = "Live: наш агент-сервер через dev-прокси /api (pnpm dev:agent-mode).";
const TRY =
  "Попробуйте: «покажи форму заявки на карту», «добавь телефон», «покажи траты таблицей».";
const page = (
  slug: IntegrationSlug,
  summary: string,
  Demo: ComponentType<DemoProps>,
  extra: Partial<Pick<IntegrationPage, "live" | "script" | "optional">> = {},
): IntegrationPage => ({
  slug,
  title: titleOf(slug),
  summary,
  Demo,
  source: SOURCES[`./demos/${slug}.tsx`] ?? "",
  file: `apps/playground/src/integration/demos/${slug}.tsx`,
  live: extra.live ?? LIVE,
  script: extra.script ?? (() => bankScript()),
  optional: extra.optional ?? true,
});

export const INTEGRATION_PAGES: readonly IntegrationPage[] = [
  page("full-chat", `useA2UIChat + готовый чат, placement "anchored". ${TRY}`, FullChatDemo),
  page(
    "follow",
    `placement "follow": поверхность переезжает под последний ход, который её изменил. ${TRY}`,
    FollowDemo,
  ),
  page(
    "single-panel",
    `surfaces: "single" + placement "panel": одна поверхность в панели справа. ${TRY}`,
    SinglePanelDemo,
    {
      live: `${LIVE} Сервер с [reply] surfaces = "single".`,
      script: () => bankScript({ single: true }),
    },
  ),
  page(
    "byo-chat",
    "Чат хоста со своими сообщениями: интерфейс только у ответов с <a2ui-json> (extractA2UI + useA2UISurfaces), действия — в onAction хоста.",
    ByoChatDemo,
    {
      live: `${LIVE} Ответ сервера переписан в «сырой» ответ LLM.`,
    },
  ),
  page(
    "headless",
    "Свой ввод, пузыри, загрузка и ошибка из send / status / working; справа — готовый чат со слотами. «сбой» — ошибка, «график» — интерфейс не удался.",
    HeadlessDemo,
  ),
  page(
    "minimal-server",
    "Сервер только с /prompt и /action: дополнительные эндпоинты проверяются один раз (Events), их нет — чат работает. «долго» — время нажать Отменить.",
    MinimalServerDemo,
    {
      live: `${LIVE} /cancel, /progress, /models, /model здесь отрезаны (404).`,
      optional: false,
    },
  ),
  page(
    "surface-history",
    `Для каждой поверхности: ход создания, ходы обновления, их сообщения и текущая модель данных. ${TRY}`,
    SurfaceHistoryDemo,
  ),
  page(
    "orchestrator",
    "Текст всегда, интерфейс — когда нужен: «сколько стоит обслуживание?» — только текст, «покажи форму заявки на карту» — текст + интерфейс, «нарисуй график» — текст, интерфейс не удался.",
    OrchestratorDemo,
    {
      live: `${LIVE} Сервер с [reply] ui = "auto" (AGENTIC_UI_REPLY_UI=auto).`,
    },
  ),
];

export const integrationPage = (slug: string) => INTEGRATION_PAGES.find((p) => p.slug === slug);
