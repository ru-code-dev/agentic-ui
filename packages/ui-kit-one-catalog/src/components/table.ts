import { spec } from "@a2ui/web_core/catalog";
import { DynamicStringSchema, DynamicValueSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { commonRef } from "../schema-refs.ts";
import { controlSizes, tableColumnFormats, tableVariants, textAligns } from "../tokens/index.ts";

const TableColumnSchema = spec(
  z.object({
    header: z.string().describe("Column header text."),
    key: z.string().describe("Property of each row object shown in this column."),
    align: z
      .enum(textAligns)
      .describe("Cell alignment; numbers and money read best right-aligned.")
      .optional(),
    format: z
      .enum(tableColumnFormats)
      .describe(
        "'currency' formats numbers as money, 'date' formats ISO date strings, 'number' adds digit grouping; default 'text'.",
      )
      .optional(),
  }),
  { closure: "additionalProperties" },
);

export const TableApi = {
  name: "Table",
  schema: spec(
    z
      .object({
        columns: z
          .array(TableColumnSchema)
          .min(1)
          .describe("Column definitions, in display order."),
        rows: commonRef(
          DynamicValueSchema,
          "DynamicValue",
          'Row objects keyed by the column `key`s. Bind it to a data-model array: `{ "path": "/transactions" }`.',
        ),
        variant: z.enum(tableVariants).describe("'striped' shades every other row.").optional(),
        size: z.enum(controlSizes).describe("Cell padding and font size.").optional(),
        caption: commonRef(
          DynamicStringSchema,
          "DynamicString",
          "Caption shown under the table.",
        ).optional(),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .describe("ISO 4217 currency of 'currency' columns; RUB when omitted.")
          .optional(),
        locale: z
          .string()
          .describe("BCP 47 locale of 'number', 'currency' and 'date' columns; ru-RU when omitted.")
          .optional(),
      })
      .describe("A data table whose rows come from a data-model array.")
      .strict(),
    { mixins: ["ComponentCommon"] },
  ),
} satisfies ComponentApi;
