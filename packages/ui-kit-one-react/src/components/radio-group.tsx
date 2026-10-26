import { createComponentImplementation } from "@a2ui/react/v0_9";
import { RadioGroupApi } from "@agentic-ui/ui-kit-one-catalog";
import {
  FormControl as KitFormControl,
  FormErrorMessage as KitFormErrorMessage,
  FormLabel as KitFormLabel,
  Radio as KitRadio,
  RadioGroup as KitRadioGroup,
  Stack as KitStack,
} from "../kit/index.ts";
import { componentMapping } from "../mapping.ts";
import { useFieldError } from "../use-field-error.ts";

/** Gap between options: wider in a row, where labels sit side by side. */
const SPACING = { row: 6, column: 2 } as const;

export const mapping = componentMapping(
  RadioGroupApi,
  [
    "FormControl (fieldset)",
    "FormLabel (legend)",
    "RadioGroup",
    "Stack",
    "Radio",
    "FormErrorMessage",
  ],
  {
    label: { kit: "FormLabel" },
    options: { kit: "Radio per option", note: "label → Radio children, value → Radio value" },
    value: {
      kit: "RadioGroup value / onChange",
      note: "two-way: choosing writes the option value to the bound path",
    },
    direction: { kit: "Stack direction", note: "column when omitted; spacing", values: SPACING },
    colorScheme: { kit: "Radio colorScheme", note: "applied to every option" },
    checks: {
      kit: "FormControl isInvalid + FormErrorMessage",
      note: "first failing message, after a choice",
    },
  },
);

export const RadioGroup = createComponentImplementation(RadioGroupApi, ({ props }) => {
  const { error, markTouched } = useFieldError(props);
  const direction = props.direction ?? "column";
  return (
    <KitFormControl
      as="fieldset"
      isDisabled={props.isDisabled === true}
      isInvalid={error !== undefined}
    >
      <KitFormLabel as="legend">{props.label}</KitFormLabel>
      <KitRadioGroup
        value={props.value ?? ""}
        onChange={(value) => {
          props.setValue(value);
          markTouched();
        }}
        isDisabled={props.isDisabled === true}
      >
        <KitStack direction={direction} spacing={SPACING[direction]}>
          {props.options.map((option) => (
            <KitRadio
              key={option.value}
              value={option.value}
              {...(props.colorScheme === undefined ? {} : { colorScheme: props.colorScheme })}
            >
              {option.label}
            </KitRadio>
          ))}
        </KitStack>
      </KitRadioGroup>
      {error === undefined ? null : <KitFormErrorMessage>{error}</KitFormErrorMessage>}
    </KitFormControl>
  );
});
