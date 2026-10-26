/** Kit facade: radio group and its options. */
import {
  Radio as ChakraRadio,
  RadioGroup as ChakraRadioGroup,
  type RadioGroupProps,
  type RadioProps,
} from "@chakra-ui/react";
import type { ComponentType } from "react";

export const RadioGroup: ComponentType<
  Pick<RadioGroupProps, "value" | "onChange" | "isDisabled" | "children">
> = ChakraRadioGroup;
export const Radio: ComponentType<Pick<RadioProps, "value" | "colorScheme" | "children">> =
  ChakraRadio;
