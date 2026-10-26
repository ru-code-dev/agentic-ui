/** Kit facade: Avatar. */
import { Avatar as ChakraAvatar, type AvatarProps } from "@chakra-ui/react";
import type { ComponentType } from "react";

export const Avatar: ComponentType<Pick<AvatarProps, "name" | "src" | "size">> = ChakraAvatar;
