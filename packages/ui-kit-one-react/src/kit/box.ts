/** Kit facade: Box. */
import { Box as ChakraBox, type BoxProps } from "@chakra-ui/react";
import type { ComponentType } from "react";
import type { KitStyleKeys } from "./types.ts";

export const Box: ComponentType<
  Pick<BoxProps, KitStyleKeys | "display" | "onClick" | "overflowX" | "children">
> = ChakraBox;
