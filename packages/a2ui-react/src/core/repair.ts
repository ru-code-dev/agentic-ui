/** Errors of one shown reply arrive in a burst (one per failing component): collected this long. */
export const REPAIR_DELAY_MS = 300;

/** The repair prompt: the page's exact errors and what the agent should do (DEC-063). */
export const repairText = (errors: readonly string[]) =>
  `Страница отклонила интерфейс из последнего ответа. Ошибки:\n${errors.map((e) => `- ${e}`).join("\n")}\nИсправь ответ и пришли исправленный интерфейс.`;

/**
 * DEC-063: the page rejected a reply (its validator, an expression or a render error); the exact
 * errors go back to the agent once, as a repair turn in the same chat via /prompt. `send` runs that
 * turn; errors that arrive together become one repair; nothing is sent while a turn runs.
 */
export function createRepairs<T>(busy: () => boolean, send: (text: string, origin: T) => unknown) {
  let pending: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    later(errors: readonly string[], origin: T): void {
      pending.push(...errors);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const list = [...new Set(pending)];
        pending = [];
        if (list.length > 0 && !busy()) send(repairText(list), origin);
      }, REPAIR_DELAY_MS);
    },
    reset(): void {
      pending = [];
      clearTimeout(timer);
    },
  };
}
