/** Kit facade: Checkbox. */
import { Checkbox as ChakraCheckbox, type CheckboxProps } from "@chakra-ui/react";
import type { ComponentType } from "react";

export const Checkbox: ComponentType<
  Pick<
    CheckboxProps,
    "isChecked" | "onChange" | "colorScheme" | "isDisabled" | "isInvalid" | "children"
  >
> = ChakraCheckbox;
