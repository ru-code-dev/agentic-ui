/**
 * The kit boundary: the only folder that imports the UI kit (Chakra UI v1, its icons and its
 * Emotion runtime) — lint-enforced. Swapping the kit for a fork means changing these files.
 *
 * Components are re-exported through narrow facades (one file per kit component) that list
 * exactly the props the renderer uses. That list is the kit surface a fork must provide — and it
 * keeps TypeScript (>= 5.0) away from Chakra v1's polymorphic `as` typings, which fail with TS2590
 * ("union type too complex") on direct JSX use. Each facade is a checked assignment, never a cast.
 */
export { Avatar } from "./avatar.ts";
export { Box } from "./box.ts";
export { Button } from "./button.ts";
export { Center } from "./center.ts";
export { Checkbox } from "./checkbox.ts";
export { Container } from "./container.ts";
export { Flex } from "./flex.ts";
export { FormControl, FormErrorMessage, FormHelperText, FormLabel } from "./form-control.ts";
export { Heading } from "./heading.ts";
export {
  AddIcon,
  ArrowBackIcon,
  ArrowDownIcon,
  ArrowForwardIcon,
  ArrowUpIcon,
  AtSignIcon,
  AttachmentIcon,
  BellIcon,
  CalendarIcon,
  ChatIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CloseIcon,
  CopyIcon,
  DeleteIcon,
  DownloadIcon,
  EditIcon,
  EmailIcon,
  ExternalLinkIcon,
  HamburgerIcon,
  InfoIcon,
  InfoOutlineIcon,
  LinkIcon,
  LockIcon,
  MinusIcon,
  MoonIcon,
  NotAllowedIcon,
  PhoneIcon,
  QuestionIcon,
  RepeatIcon,
  SearchIcon,
  SettingsIcon,
  StarIcon,
  SunIcon,
  TimeIcon,
  UnlockIcon,
  ViewIcon,
  ViewOffIcon,
  WarningIcon,
  WarningTwoIcon,
  type KitIcon,
} from "./icons.ts";
export { Input } from "./input.ts";
export { List, ListItem, OrderedList, UnorderedList } from "./list.ts";
export {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
} from "./modal.ts";
export { DarkMode, IdProvider, LightMode } from "./providers.ts";
export { Radio, RadioGroup } from "./radio.ts";
export { scopedResetCss, type ScopedResetOptions } from "./scoped-reset.ts";
export { SimpleGrid } from "./simple-grid.ts";
export { Stack } from "./stack.ts";
export { Switch } from "./switch.ts";
export { Table, TableCaption, Tbody, Td, Th, Thead, Tr } from "./table.ts";
export { Tab, TabList, TabPanel, TabPanels, Tabs } from "./tabs.ts";
export { Tag } from "./tag.ts";
export { Text } from "./text.ts";
export {
  CSSReset,
  EmotionThemeProvider,
  Global,
  GlobalStyle,
  ThemeProvider,
  css,
  extendTheme,
  toCSSVar,
} from "./theme.ts";
export { type KitStyleKeys, type KitStyleProps, type WithChildren } from "./types.ts";
