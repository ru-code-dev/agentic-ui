import type { Progress } from "@agentic-ui/a2ui-react/core";

/** "1 ошибка", "3 ошибки", "5 ошибок". */
export function errorsLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} ошибка`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} ошибки`;
  return `${count} ошибок`;
}

/** Elapsed time of the working message: "8 с", "1 мин 05 с". */
export function elapsedLabel(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} с`;
  return `${Math.floor(seconds / 60)} мин ${String(seconds % 60).padStart(2, "0")} с`;
}

/**
 * SV-C20: the attempt line of the working message from the optional progress endpoint, e.g.
 * "Попытка 1 не прошла проверку: 3 ошибки, исправляю (2 из 4)"; undefined when there is nothing
 * to add to the plain working message (no progress, first attempt, or a finished request).
 */
export function progressLine(progress: Progress | undefined): string | undefined {
  if (progress === undefined || progress.state !== "repairing") return undefined;
  const failed = progress.attempt - 1;
  return (
    `Попытка ${failed} не прошла проверку: ${errorsLabel(progress.errorCount)}, ` +
    `исправляю (${progress.attempt} из ${progress.maxAttempts})`
  );
}
