/** Kit facade: Heading. */
import { Heading as ChakraHeading, type HeadingProps } from "@chakra-ui/react";
import type { ComponentType } from "react";

export const Heading: ComponentType<
  Pick<HeadingProps, "as" | "size" | "color" | "textAlign" | "children">
> = ChakraHeading;
