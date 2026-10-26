import { z } from "zod";

/**
 * Icon names of the contract — names only, kit-neutral. Each renderer maps every name to one of
 * its kit's icons (ui-kit-one-react: `src/icon-map.ts`).
 */
export const iconNames = [
  "add",
  "arrowBack",
  "arrowDown",
  "arrowForward",
  "arrowUp",
  "atSign",
  "attachment",
  "bell",
  "calendar",
  "chat",
  "check",
  "checkCircle",
  "chevronDown",
  "chevronLeft",
  "chevronRight",
  "chevronUp",
  "close",
  "copy",
  "delete",
  "download",
  "edit",
  "email",
  "externalLink",
  "info",
  "infoOutline",
  "link",
  "lock",
  "menu",
  "minus",
  "moon",
  "notAllowed",
  "phone",
  "question",
  "repeat",
  "search",
  "settings",
  "star",
  "sun",
  "time",
  "unlock",
  "view",
  "viewOff",
  "warning",
  "warningTwo",
] as const;

export type IconName = (typeof iconNames)[number];

export const IconNameSchema = z.enum(iconNames);
