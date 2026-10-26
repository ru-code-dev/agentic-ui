import {
  AvatarApi,
  BoxApi,
  CenterApi,
  ContainerApi,
  FlexApi,
  GridApi,
  HeadingApi,
  TagApi,
  TextApi,
} from "@agentic-ui/ui-kit-one-catalog";
import {
  Avatar,
  Box,
  Center,
  Container,
  Flex,
  Heading,
  SimpleGrid,
  Tag,
  Text,
} from "./kit/index.ts";
import { passthrough } from "./passthrough.tsx";

/** Pure-data components (DEC-005): one line each — contract names and values are the kit's. */
export const PASSTHROUGH = {
  Box: passthrough(BoxApi, Box, "Box"),
  Center: passthrough(CenterApi, Center, "Center"),
  Container: passthrough(ContainerApi, Container, "Container"),
  Flex: passthrough(FlexApi, Flex, "Flex"),
  Grid: passthrough(GridApi, SimpleGrid, "SimpleGrid"),
  Heading: passthrough(HeadingApi, Heading, "Heading"),
  Text: passthrough(TextApi, Text, "Text"),
  Tag: passthrough(TagApi, Tag, "Tag"),
  Avatar: passthrough(AvatarApi, Avatar, "Avatar"),
};
