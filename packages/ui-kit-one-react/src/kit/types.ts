/** Shared facade types. */
import type { BoxProps } from "@chakra-ui/react";
import type { ReactNode } from "react";

export type WithChildren = { readonly children?: ReactNode };

/** The kit props behind the contract's StyleProps (same names). */
export type KitStyleKeys =
  | "p"
  | "px"
  | "py"
  | "m"
  | "mx"
  | "my"
  | "gap"
  | "bg"
  | "color"
  | "borderRadius"
  | "borderWidth"
  | "borderColor"
  | "shadow"
  | "w"
  | "maxW"
  | "minH"
  | "textAlign";

export type KitStyleProps = Pick<BoxProps, KitStyleKeys>;
