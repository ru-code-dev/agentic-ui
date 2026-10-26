/** Kit facade: Flex. */
import { Flex as ChakraFlex, type FlexProps } from "@chakra-ui/react";
import type { ComponentType } from "react";
import type { KitStyleKeys } from "./types.ts";

export const Flex: ComponentType<
  Pick<FlexProps, KitStyleKeys | "direction" | "align" | "justify" | "wrap" | "children">
> = ChakraFlex;
