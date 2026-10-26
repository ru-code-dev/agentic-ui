/** Kit facade: Stack. */
import { Stack as ChakraStack, type StackProps } from "@chakra-ui/react";
import type { ComponentType } from "react";

export const Stack: ComponentType<Pick<StackProps, "direction" | "spacing" | "children">> =
  ChakraStack;
