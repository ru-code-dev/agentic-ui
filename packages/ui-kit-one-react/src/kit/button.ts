/** Kit facade: Button. */
import { Button as ChakraButton, type ButtonProps } from "@chakra-ui/react";
import type { ComponentType } from "react";

export const Button: ComponentType<
  Pick<
    ButtonProps,
    | "variant"
    | "colorScheme"
    | "size"
    | "isDisabled"
    | "isLoading"
    | "isFullWidth"
    | "onClick"
    | "leftIcon"
    | "rightIcon"
    | "children"
  >
> = ChakraButton;
