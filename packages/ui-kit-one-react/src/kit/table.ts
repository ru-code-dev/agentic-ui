/** Kit facade: table and its parts. */
import {
  Table as ChakraTable,
  TableCaption as ChakraTableCaption,
  Tbody as ChakraTbody,
  Td as ChakraTd,
  Th as ChakraTh,
  Thead as ChakraThead,
  Tr as ChakraTr,
  type TableCellProps,
  type TableProps,
} from "@chakra-ui/react";
import type { ComponentType } from "react";
import type { WithChildren } from "./types.ts";

export const Table: ComponentType<Pick<TableProps, "variant" | "size" | "children">> = ChakraTable;
export const TableCaption: ComponentType<WithChildren> = ChakraTableCaption;
export const Thead: ComponentType<WithChildren> = ChakraThead;
export const Tbody: ComponentType<WithChildren> = ChakraTbody;
export const Tr: ComponentType<WithChildren> = ChakraTr;
export const Th: ComponentType<Pick<TableCellProps, "textAlign" | "children">> = ChakraTh;
export const Td: ComponentType<Pick<TableCellProps, "textAlign" | "children">> = ChakraTd;
