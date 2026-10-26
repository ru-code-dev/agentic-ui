/**
 * Forwards everything the preview document reports as an error — console.error, uncaught errors
 * and unhandled rejections — to `report` (the playground's Errors tab). Returns an undo function.
 */
export function captureConsoleErrors(report: (message: string) => void): () => void {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    report(
      args
        .map((arg) =>
          arg instanceof Error ? arg.message : typeof arg === "string" ? arg : JSON.stringify(arg),
        )
        .join(" "),
    );
    original(...args);
  };
  const onError = (event: ErrorEvent) => report(event.message);
  const onRejection = (event: PromiseRejectionEvent) =>
    report(event.reason instanceof Error ? event.reason.message : String(event.reason));
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    console.error = original;
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
