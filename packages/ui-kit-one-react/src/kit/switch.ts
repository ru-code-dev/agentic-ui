/** Kit facade: Switch. */
import { Switch as ChakraSwitch, type SwitchProps } from "@chakra-ui/react";
import type { ComponentType } from "react";

export const Switch: ComponentType<
  Pick<SwitchProps, "id" | "isChecked" | "onChange" | "colorScheme" | "isDisabled">
> = ChakraSwitch;
