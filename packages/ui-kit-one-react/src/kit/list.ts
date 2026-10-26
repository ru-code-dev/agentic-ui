/** Kit facade: lists and list items. */
import {
  List as ChakraList,
  ListItem as ChakraListItem,
  OrderedList as ChakraOrderedList,
  UnorderedList as ChakraUnorderedList,
  type ListProps,
} from "@chakra-ui/react";
import type { ComponentType } from "react";
import type { WithChildren } from "./types.ts";

export const List: ComponentType<Pick<ListProps, "spacing" | "children">> = ChakraList;
export const OrderedList: ComponentType<Pick<ListProps, "spacing" | "children">> =
  ChakraOrderedList;
export const UnorderedList: ComponentType<Pick<ListProps, "spacing" | "children">> =
  ChakraUnorderedList;
export const ListItem: ComponentType<WithChildren> = ChakraListItem;
