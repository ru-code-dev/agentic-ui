import { createComponentImplementation } from "@a2ui/react/v0_9";
import { TableApi, formatting } from "@agentic-ui/ui-kit-one-catalog";
import { formatCell } from "../format.ts";
import {
  Box as KitBox,
  Table as KitTable,
  TableCaption as KitTableCaption,
  Tbody as KitTbody,
  Td as KitTd,
  Th as KitTh,
  Thead as KitThead,
  Tr as KitTr,
} from "../kit/index.ts";
import { componentMapping, identityProps } from "../mapping.ts";

export const mapping = componentMapping(
  TableApi,
  ["Box (horizontal scroll)", "Table", "TableCaption", "Thead", "Tbody", "Tr", "Th", "Td"],
  {
    columns: {
      kit: "Th per column; Td per row and column",
      note: "header → Th, key → cell value, align → textAlign",
    },
    rows: { kit: "Tr per row", note: "resolved array of row objects; non-objects are skipped" },
    caption: { kit: "TableCaption" },
    currency: {
      kit: "Intl.NumberFormat currency",
      note: `"currency" columns; ${formatting.currency} when omitted`,
    },
    locale: {
      kit: "Intl locale",
      note: `"number", "currency", "date" columns; ${formatting.locale} when omitted`,
    },
  },
);

type Row = Readonly<Record<string, unknown>>;
const isRow = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const Table = createComponentImplementation(TableApi, ({ props }) => {
  const rows = Array.isArray(props.rows) ? props.rows.filter(isRow) : [];
  const options = {
    locale: props.locale ?? formatting.locale,
    currency: props.currency ?? formatting.currency,
  };
  return (
    <KitBox overflowX="auto" w="full">
      <KitTable {...identityProps(KitTable, props, mapping.identityKeys)}>
        {props.caption === undefined ? null : <KitTableCaption>{props.caption}</KitTableCaption>}
        <KitThead>
          <KitTr>
            {props.columns.map((column) => (
              <KitTh key={column.key} textAlign={column.align ?? "left"}>
                {column.header}
              </KitTh>
            ))}
          </KitTr>
        </KitThead>
        <KitTbody>
          {rows.map((row, rowIndex) => (
            // oxlint-disable-next-line react/no-array-index-key -- rows are plain data without identity; position is the key
            <KitTr key={rowIndex}>
              {props.columns.map((column) => (
                <KitTd key={column.key} textAlign={column.align ?? "left"}>
                  {formatCell(row[column.key], column.format ?? "text", options)}
                </KitTd>
              ))}
            </KitTr>
          ))}
        </KitTbody>
      </KitTable>
    </KitBox>
  );
});
