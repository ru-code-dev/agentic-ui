export type CellFormat = "text" | "number" | "currency" | "date";

export interface CellFormatOptions {
  readonly locale: string;
  readonly currency: string;
}

/** The contract's default locale: the fallback for a locale tag Intl refuses. */
const DEFAULT_LOCALE = "ru-RU";

/**
 * Formats one Table cell for display (Intl, so Russian month names are declined). A locale Intl
 * refuses (RangeError, e.g. "ru_RU") falls back to the default locale instead of throwing while
 * rendering (A3-13): one bad prop never blanks the surface.
 */
export function formatCell(value: unknown, format: CellFormat, options: CellFormatOptions): string {
  try {
    return formatWith(value, format, options);
  } catch (error) {
    if (!(error instanceof RangeError) || options.locale === DEFAULT_LOCALE) throw error;
    return formatWith(value, format, { ...options, locale: DEFAULT_LOCALE });
  }
}

function formatWith(
  value: unknown,
  format: CellFormat,
  { locale, currency }: CellFormatOptions,
): string {
  if (value === null || value === undefined) return "";
  switch (format) {
    case "number":
      return typeof value === "number"
        ? new Intl.NumberFormat(locale).format(value)
        : String(value);
    case "currency":
      return typeof value === "number"
        ? new Intl.NumberFormat(locale, { style: "currency", currency }).format(value)
        : String(value);
    case "date": {
      const text = String(value);
      const date = new Date(text);
      // A date-only ISO string means that calendar day; format it in UTC so no timezone shifts it.
      const timeZone = /^\d{4}-\d{2}-\d{2}$/.test(text) ? "UTC" : undefined;
      return Number.isNaN(date.getTime())
        ? text
        : new Intl.DateTimeFormat(locale, {
            day: "numeric",
            month: "long",
            year: "numeric",
            ...(timeZone ? { timeZone } : {}),
          }).format(date);
    }
    case "text":
      return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
}
