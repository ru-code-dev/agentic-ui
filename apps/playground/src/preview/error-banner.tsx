/**
 * A visible error strip inside the preview document (PG-08): the preview belongs to the kit, so
 * it is styled inline rather than with playground CSS.
 */
export function ErrorBanner({ errors }: { errors: readonly string[] }) {
  if (errors.length === 0) return null;
  return (
    <div
      role="alert"
      data-testid="preview-error"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        padding: "8px 12px",
        background: "#3b0d0d",
        borderBottom: "1px solid #7f1d1d",
        color: "#fecaca",
        font: "12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      {errors.map((error) => (
        <div key={error}>{error}</div>
      ))}
    </div>
  );
}
