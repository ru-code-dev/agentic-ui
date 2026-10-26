/** Kit facade: SimpleGrid. */
import { SimpleGrid as ChakraSimpleGrid, useToken, type SimpleGridProps } from "@chakra-ui/react";
import { createElement, type ComponentType } from "react";
import type { KitStyleKeys } from "./types.ts";

type SimpleGridFacadeProps = Pick<SimpleGridProps, KitStyleKeys | "columns" | "children"> & {
  /** A `sizes` theme token (e.g. "3xs"). */
  readonly minChildWidth?: string;
};

const KitSimpleGrid: ComponentType<SimpleGridFacadeProps> = ChakraSimpleGrid;

/**
 * Chakra v1 SimpleGrid writes `minChildWidth` into `minmax()` verbatim, so a size token would be
 * invalid CSS; the facade resolves it against the theme first.
 */
export const SimpleGrid: ComponentType<SimpleGridFacadeProps> = ({ minChildWidth, ...props }) => {
  const width = useToken("sizes", minChildWidth ?? "");
  return createElement(KitSimpleGrid, {
    ...props,
    minChildWidth: minChildWidth === undefined ? undefined : width,
  });
};
