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

/** The A2UI basic functions the contract exposes. Renderers reuse web_core's implementations. */
export const FUNCTION_APIS = [
  RequiredApi,
  RegexApi,
  LengthApi,
  NumericApi,
  EmailApi,
  FormatStringApi,
  FormatNumberApi,
  FormatCurrencyApi,
  FormatDateApi,
  PluralizeApi,
  OpenUrlApi,
  AndApi,
  OrApi,
  NotApi,
];
