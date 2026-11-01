import type { FunctionApi } from "@a2ui/web_core/v0_9";
import {
  AndApi,
  EmailApi,
  FormatCurrencyApi,
  FormatDateApi,
  FormatNumberApi,
  FormatStringApi,
  LengthApi,
  NotApi,
  NumericApi,
  OpenUrlApi,
  OrApi,
  PluralizeApi,
  RegexApi,
  RequiredApi,
} from "@a2ui/web_core/v0_9/basic_catalog";

/** What ui-kit-one adds to web_core's description (EXPERIMENT §9: no expression engine). */
const FORMAT_STRING_NOTE =
  " In ui-kit-one use only data placeholders such as `${/order/id}` or `${name}` inside a template: no operators, comparisons or ternaries (`${/read ? 'a' : 'b'}` is not evaluated).";

const withNote = <T extends FunctionApi>(api: T, note: string): T => ({
  ...api,
  description: `${api.description ?? ""}${note}`,
});

/** The A2UI basic functions the contract exposes. Renderers reuse web_core's implementations. */
export const FUNCTION_APIS = [
  RequiredApi,
  RegexApi,
  LengthApi,
  NumericApi,
  EmailApi,
  withNote(FormatStringApi, FORMAT_STRING_NOTE),
  FormatNumberApi,
  FormatCurrencyApi,
  FormatDateApi,
  PluralizeApi,
  OpenUrlApi,
  AndApi,
  OrApi,
  NotApi,
];

/** What the agent uses a function for; generated into the catalog rules (SV-C22). */
export const FUNCTION_USES: Readonly<Record<string, string>> = {
  formatCurrency: "money amounts (never write a formatted amount by hand)",
  formatDate:
    'dates, with the pattern "dd.MM.yyyy" (the renderer locale is ru-RU; month names are not declined)',
  formatNumber: "plain numbers with digit grouping",
  formatString:
    "text that mixes literals and data: only ${/path} placeholders, no expressions, operators or ternaries",
  pluralize: "words that agree with a count",
};
