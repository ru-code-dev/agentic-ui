/** Kit facade: modal dialog and its parts. */
import {
  Modal as ChakraModal,
  ModalBody as ChakraModalBody,
  ModalCloseButton as ChakraModalCloseButton,
  ModalContent as ChakraModalContent,
  ModalHeader as ChakraModalHeader,
  ModalOverlay as ChakraModalOverlay,
  type ModalBodyProps,
  type ModalProps,
} from "@chakra-ui/react";
import type { ComponentType } from "react";
import type { WithChildren } from "./types.ts";

export const Modal: ComponentType<
  Pick<
    ModalProps,
    "isOpen" | "onClose" | "size" | "blockScrollOnMount" | "portalProps" | "children"
  >
> = ChakraModal;
export const ModalOverlay: ComponentType<WithChildren> = ChakraModalOverlay;
export const ModalContent: ComponentType<WithChildren> = ChakraModalContent;
export const ModalHeader: ComponentType<WithChildren> = ChakraModalHeader;
export const ModalCloseButton: ComponentType<WithChildren> = ChakraModalCloseButton;
export const ModalBody: ComponentType<Pick<ModalBodyProps, "pb" | "children">> = ChakraModalBody;
