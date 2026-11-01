import { spec } from "@a2ui/web_core/catalog";
import { DynamicStringSchema, DynamicValueSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { prop } from "../prop-kinds.ts";
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
        columns: prop.option(
          z
            .array(TableColumnSchema)
            .min(1)
            .describe("Column definitions, in display order (literal)."),
        ),
        rows: prop.content(
          commonRef(
            DynamicValueSchema,
            "DynamicValue",
            'Row objects keyed by the column `key`s. Bind it to a data-model array: `{ "path": "/transactions" }`.',
          ),
        ),
        variant: prop.style("variant", tableVariants, "'striped' shades every other row."),
        size: prop.style("variant", controlSizes, "Cell padding and font size."),
        caption: prop.content(
          commonRef(
            DynamicStringSchema,
            "DynamicString",
            "Caption shown under the table.",
          ).optional(),
        ),
        currency: prop.option(
          z
            .string()
            .regex(/^[A-Z]{3}$/)
            .describe("ISO 4217 currency of 'currency' columns; RUB when omitted.")
            .optional(),
        ),
        locale: prop.option(
          z
            .string()
            // A3-13: BCP 47 shape (language, then subtags joined by "-"), so "ru_RU" is refused.
            .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/)
            .describe(
              "BCP 47 locale of 'number', 'currency' and 'date' columns; ru-RU when omitted.",
            )
            .optional(),
        ),
      })
      .describe("A data table whose rows come from a data-model array.")
      .strict(),
    { mixins: ["ComponentCommon"] },
  ),
} satisfies ComponentApi;
