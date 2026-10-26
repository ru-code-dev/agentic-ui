/** Kit facade: Center. */
import { Center as ChakraCenter, type BoxProps } from "@chakra-ui/react";
import type { ComponentType } from "react";
import type { KitStyleKeys } from "./types.ts";

export const Center: ComponentType<Pick<BoxProps, KitStyleKeys | "children">> = ChakraCenter;
