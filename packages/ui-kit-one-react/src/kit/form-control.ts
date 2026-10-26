/** Kit facade: form field wrapper, label, helper and error text. */
import {
  FormControl as ChakraFormControl,
  FormErrorMessage as ChakraFormErrorMessage,
  FormHelperText as ChakraFormHelperText,
  FormLabel as ChakraFormLabel,
  type FormControlProps,
  type FormLabelProps,
} from "@chakra-ui/react";
import type { ComponentType } from "react";
import type { WithChildren } from "./types.ts";

export const FormControl: ComponentType<
  Pick<
    FormControlProps,
    "as" | "isRequired" | "isDisabled" | "isInvalid" | "display" | "alignItems" | "children"
  >
> = ChakraFormControl;
export const FormLabel: ComponentType<Pick<FormLabelProps, "as" | "htmlFor" | "mb" | "children">> =
  ChakraFormLabel;
export const FormHelperText: ComponentType<WithChildren> = ChakraFormHelperText;
export const FormErrorMessage: ComponentType<WithChildren> = ChakraFormErrorMessage;
