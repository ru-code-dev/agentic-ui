import { keysOf, nonEmpty } from "./names.ts";

/** Box sizes of square elements. */
export const boxSizes = {
  /** Source: src/foundations/sizes.ts (space keys used as `boxSize`) */
  icon: {
    "3": "0.75rem",
    "4": "1rem",
    "5": "1.25rem",
    "6": "1.5rem",
    "8": "2rem",
    "10": "2.5rem",
    "12": "3rem",
  },
  /** Source: src/components/avatar.ts → sizes */
  avatar: {
    "2xs": "1rem",
    xs: "1.5rem",
    sm: "2rem",
    md: "3rem",
    lg: "4rem",
    xl: "6rem",
    "2xl": "8rem",
  },
} as const;

export const iconSizeTokens = nonEmpty(keysOf(boxSizes.icon));
export const avatarSizeTokens = nonEmpty(keysOf(boxSizes.avatar));
