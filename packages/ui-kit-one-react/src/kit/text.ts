/** Kit facade: Text. */
import { Text as ChakraText, type TextProps } from "@chakra-ui/react";
import type { ComponentType } from "react";

export const Text: ComponentType<
  Pick<TextProps, "fontSize" | "fontWeight" | "textAlign" | "color" | "noOfLines" | "children">
> = ChakraText;
