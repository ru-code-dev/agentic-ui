/** Kit facade: providers the kit provider composes (ids, color-mode lock). */
import {
  DarkMode as ChakraDarkMode,
  IdProvider as ChakraIdProvider,
  LightMode as ChakraLightMode,
} from "@chakra-ui/react";
import type { ComponentType } from "react";
import type { WithChildren } from "./types.ts";

export const IdProvider: ComponentType<WithChildren> = ChakraIdProvider;
export const DarkMode: ComponentType<WithChildren> = ChakraDarkMode;
export const LightMode: ComponentType<WithChildren> = ChakraLightMode;
