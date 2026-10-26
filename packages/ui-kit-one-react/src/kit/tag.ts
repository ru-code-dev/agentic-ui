/** Kit facade: Tag. */
import { Tag as ChakraTag, type TagProps } from "@chakra-ui/react";
import type { ComponentType } from "react";

export const Tag: ComponentType<Pick<TagProps, "size" | "variant" | "colorScheme" | "children">> =
  ChakraTag;
