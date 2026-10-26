import type { IconName } from "@agentic-ui/ui-kit-one-catalog";
import * as kit from "./kit/index.ts";

type KitIconName = Extract<keyof typeof kit, `${string}Icon`>;

/** Contract icon name → kit icon export (documented in MAPPING.md). */
export const ICON_KIT_NAMES: Readonly<Record<IconName, KitIconName>> = {
  add: "AddIcon",
  arrowBack: "ArrowBackIcon",
  arrowDown: "ArrowDownIcon",
  arrowForward: "ArrowForwardIcon",
  arrowUp: "ArrowUpIcon",
  atSign: "AtSignIcon",
  attachment: "AttachmentIcon",
  bell: "BellIcon",
  calendar: "CalendarIcon",
  chat: "ChatIcon",
  check: "CheckIcon",
  checkCircle: "CheckCircleIcon",
  chevronDown: "ChevronDownIcon",
  chevronLeft: "ChevronLeftIcon",
  chevronRight: "ChevronRightIcon",
  chevronUp: "ChevronUpIcon",
  close: "CloseIcon",
  copy: "CopyIcon",
  delete: "DeleteIcon",
  download: "DownloadIcon",
  edit: "EditIcon",
  email: "EmailIcon",
  externalLink: "ExternalLinkIcon",
  info: "InfoIcon",
  infoOutline: "InfoOutlineIcon",
  link: "LinkIcon",
  lock: "LockIcon",
  menu: "HamburgerIcon",
  minus: "MinusIcon",
  moon: "MoonIcon",
  notAllowed: "NotAllowedIcon",
  phone: "PhoneIcon",
  question: "QuestionIcon",
  repeat: "RepeatIcon",
  search: "SearchIcon",
  settings: "SettingsIcon",
  star: "StarIcon",
  sun: "SunIcon",
  time: "TimeIcon",
  unlock: "UnlockIcon",
  view: "ViewIcon",
  viewOff: "ViewOffIcon",
  warning: "WarningIcon",
  warningTwo: "WarningTwoIcon",
};

/** Contract icon name → kit icon component. */
export const ICONS: Readonly<Record<IconName, kit.KitIcon>> = Object.fromEntries(
  Object.entries(ICON_KIT_NAMES).map(([name, kitName]) => [name, kit[kitName]]),
) as Record<IconName, kit.KitIcon>;
