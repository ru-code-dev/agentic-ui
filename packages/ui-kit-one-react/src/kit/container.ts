/** Kit facade: Container. */
import { Container as ChakraContainer, type ContainerProps } from "@chakra-ui/react";
import type { ComponentType } from "react";
import type { KitStyleKeys } from "./types.ts";

export const Container: ComponentType<
  Pick<ContainerProps, KitStyleKeys | "centerContent" | "children">
> = ChakraContainer;
