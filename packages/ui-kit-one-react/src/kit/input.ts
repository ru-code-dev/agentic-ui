/** Kit facade: Input. */
import { Input as ChakraInput, type InputProps } from "@chakra-ui/react";
import type { ComponentType } from "react";

export const Input: ComponentType<
  Pick<InputProps, "type" | "value" | "onChange" | "onBlur" | "placeholder">
> = ChakraInput;
