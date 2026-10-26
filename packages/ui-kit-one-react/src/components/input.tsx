import { createComponentImplementation } from "@a2ui/react/v0_9";
import { InputApi } from "@agentic-ui/ui-kit-one-catalog";
import {
  FormControl as KitFormControl,
  FormErrorMessage as KitFormErrorMessage,
  FormHelperText as KitFormHelperText,
  FormLabel as KitFormLabel,
  Input as KitInput,
} from "../kit/index.ts";
import { componentMapping, identityProps } from "../mapping.ts";
import { useFieldError } from "../use-field-error.ts";

export const mapping = componentMapping(
  InputApi,
  ["FormControl", "FormLabel", "Input", "FormHelperText", "FormErrorMessage"],
  {
    label: { kit: "FormLabel" },
    value: {
      kit: "Input value / onChange",
      note: "two-way: typing writes the string to the bound path",
    },
    helperText: { kit: "FormHelperText", note: "shown while the field is valid" },
    isRequired: { kit: "FormControl isRequired" },
    isDisabled: { kit: "FormControl isDisabled" },
    checks: {
      kit: "FormControl isInvalid + FormErrorMessage",
      note: "first failing message, after the field is edited",
    },
  },
);

export const Input = createComponentImplementation(InputApi, ({ props }) => {
  const { error, markTouched } = useFieldError(props);
  // The setter writes to the data model, which holds any JSON value; its type follows the literal form.
  const write = props.setValue as (value: string | number) => void;
  return (
    <KitFormControl
      isRequired={props.isRequired === true}
      isDisabled={props.isDisabled === true}
      isInvalid={error !== undefined}
    >
      <KitFormLabel>{props.label}</KitFormLabel>
      <KitInput
        {...identityProps(KitInput, props, mapping.identityKeys)}
        value={String(props.value ?? "")}
        onChange={(event) => {
          const raw = event.target.value;
          // A number field writes a number, so numeric checks and formatCurrency work on its value.
          write(
            props.type === "number" && raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw,
          );
          markTouched();
        }}
        onBlur={markTouched}
      />
      {error === undefined ? (
        props.helperText === undefined ? null : (
          <KitFormHelperText>{props.helperText}</KitFormHelperText>
        )
      ) : (
        <KitFormErrorMessage>{error}</KitFormErrorMessage>
      )}
    </KitFormControl>
  );
});
