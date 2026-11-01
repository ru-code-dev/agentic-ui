/** The default chat's texts (SV-C26 `labels`; the contract locale is ru-RU). */
export interface ChatLabels {
  readonly input: string;
  readonly send: string;
  readonly cancel: string;
  readonly cancelling: string;
  /** A3-16: the server did not confirm the cancel; the next click stops waiting. */
  readonly cancelUnconfirmed: string;
  readonly retry: string;
  readonly working: string;
  readonly action: string;
  readonly repair: string;
  readonly failedUi: string;
  readonly invalidUi: string;
  readonly error: string;
  readonly cancelled: string;
  readonly model: string;
}

export const DEFAULT_LABELS: ChatLabels = {
  input: "Напишите, что показать…",
  send: "Отправить",
  cancel: "Отменить",
  cancelling: "Отменяю…",
  cancelUnconfirmed: "Сервер не подтвердил отмену: нажмите ещё раз, чтобы перестать ждать",
  retry: "Повторить",
  working: "Агент готовит ответ",
  action: "Действие",
  repair: "Автоисправление",
  failedUi: "Интерфейс построить не удалось",
  invalidUi: "Интерфейс не прошёл проверку страницы и не показан",
  error: "Ошибка запроса",
  cancelled: "Отменено",
  model: "Модель",
};
