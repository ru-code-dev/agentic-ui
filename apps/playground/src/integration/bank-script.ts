import { CATALOG_ID } from "@agentic-ui/ui-kit-one-catalog";
import type { Script, ScriptReply, ScriptRequest } from "./scripted-server.ts";

const v = (message: object) => ({ version: "v0.9", ...message });
const create = (surfaceId: string) =>
  v({ createSurface: { surfaceId, catalogId: CATALOG_ID, sendDataModel: true } });
const components = (surfaceId: string, list: readonly object[]) =>
  v({ updateComponents: { surfaceId, components: list } });
const data = (surfaceId: string, path: string, value: unknown) =>
  v({ updateDataModel: { surfaceId, path, value } });

type Topic = "card" | "spending";

const card = (id: string, phone: boolean) => [
  components(id, [
    {
      id: "root",
      component: "Flex",
      direction: "column",
      gap: "3",
      children: ["title", "name", ...(phone ? ["phone"] : []), "send", "status"],
    },
    { id: "title", component: "Heading", text: "Заявка на карту", size: "md" },
    { id: "name", component: "Input", label: "Имя", value: { path: "/form/name" } },
    ...(phone
      ? [{ id: "phone", component: "Input", label: "Телефон", value: { path: "/form/phone" } }]
      : []),
    {
      id: "send",
      component: "Button",
      label: "Отправить заявку",
      action: { event: { name: "form.submit" } },
    },
    { id: "status", component: "Text", text: { path: "/status" } },
  ]),
];
const cardData = (id: string) =>
  data(id, "/", { form: { name: "", phone: "" }, status: "Заявка не отправлена" });

const spending = (id: string) => [
  components(id, [
    {
      id: "root",
      component: "Table",
      variant: "striped",
      caption: "Траты за неделю",
      rows: { path: "/rows" },
      columns: [
        { header: "Дата", key: "date", format: "date" },
        { header: "Магазин", key: "shop" },
        { header: "Сумма", key: "sum", format: "currency", align: "right" },
      ],
    },
  ]),
  data(id, "/rows", [
    { date: "2026-10-01", shop: "Пятёрочка", sum: 1250 },
    { date: "2026-10-03", shop: "Аптека", sum: 640 },
    { date: "2026-10-04", shop: "Такси", sum: 890 },
  ]),
];

const ANSWERS: readonly (readonly [RegExp, string])[] = [
  [
    /обслуживан|стоит|цена/,
    "Обслуживание дебетовой карты бесплатное при тратах от 10 000 ₽ в месяц.",
  ],
  [/кэшбэк|кешбэк/, "Кэшбэк 1% на все покупки и до 5% в выбранных категориях."],
  [/привет|здравств/, "Здравствуйте! Спросите о карте или попросите форму заявки, траты таблицей."],
];
const HELP =
  "Я сценарный агент (без сервера и LLM). Попросите «форму заявки на карту», «траты таблицей», " +
  "«добавь телефон» или задайте вопрос, например «сколько стоит обслуживание?».";

const topicOf = (text: string): Topic | undefined =>
  /карт|заявк|форм/.test(text) ? "card" : /трат|расход|операц/.test(text) ? "spending" : undefined;

/**
 * A deterministic bank agent for the Scripted mode (one per chat, it remembers which surfaces it made).
 * A UI request creates a surface per topic (card form, spending table) and a refinement or an action updates
 * that surface in place (SV-C26); a question gets a text-only reply and «график» text + failed UI (SV-C27).
 * `single`: one surface `main` for every topic (prompt mode `surfaces: "single"`): a refinement updates it,
 * another topic rebuilds it under the same surfaceId.
 */
export function bankScript({ single = false }: { readonly single?: boolean } = {}): Script {
  const shown = new Map<string, Topic>();
  const surfaceFor = (topic: Topic) =>
    single ? "main" : topic === "card" ? "card-form" : "spending";
  const build = (topic: Topic, phone: boolean): ScriptReply => {
    const id = surfaceFor(topic);
    const before = shown.get(id);
    shown.set(id, topic);
    if (before === topic && topic === "card")
      return { text: "Добавил в форму поле «Телефон».", messages: card(id, phone) };
    const restart = before === undefined ? [] : [v({ deleteSurface: { surfaceId: id } })];
    return topic === "card"
      ? {
          text: "Вот форма заявки на карту.",
          messages: [...restart, create(id), ...card(id, phone), cardData(id)],
        }
      : {
          text: "Ваши траты за неделю таблицей.",
          messages: [...restart, create(id), ...spending(id)],
        };
  };
  const action = (request: Extract<ScriptRequest, { kind: "action" }>): ScriptReply => {
    const name = (request.dataModel as { form?: { name?: unknown } } | undefined)?.form?.name;
    const who = typeof name === "string" && name !== "" ? name : "без имени";
    return {
      text: `Заявка принята, ${who}.`,
      messages: [data(request.surfaceId, "/status", `Заявка принята: ${who}`)],
    };
  };
  return (request) => {
    if (request.kind === "action") return action(request);
    const text = request.text.toLowerCase();
    if (/долго/.test(text)) return { text: "Готово, хотя и долго.", delayMs: 4000 };
    if (/сбой|ошибк/.test(text)) return { text: "сервис временно недоступен", failure: 503 };
    if (/график/.test(text))
      return {
        status: "fallback",
        text: "График построить не удалось, отвечаю текстом: траты 2 780 ₽.",
      };
    if (/телефон/.test(text) && [...shown.values()].includes("card")) return build("card", true);
    const topic = topicOf(text);
    if (topic !== undefined) return build(topic, false);
    return { text: ANSWERS.find(([pattern]) => pattern.test(text))?.[1] ?? HELP };
  };
}
