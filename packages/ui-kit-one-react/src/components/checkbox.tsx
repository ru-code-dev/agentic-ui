import { createComponentImplementation } from "@a2ui/react/v0_9";
import { CheckboxApi } from "@agentic-ui/ui-kit-one-catalog";
import {
  Checkbox as KitCheckbox,
  FormControl as KitFormControl,
  FormErrorMessage as KitFormErrorMessage,
} from "../kit/index.ts";
import { componentMapping, identityProps } from "../mapping.ts";
import { useFieldError } from "../use-field-error.ts";

export const mapping = componentMapping(
  CheckboxApi,
  ["FormControl", "Checkbox", "FormErrorMessage"],
  {
    label: { kit: "Checkbox children" },
    value: {
      kit: "Checkbox isChecked / onChange",
      note: "two-way: toggling writes true/false to the bound path",
    },
    checks: {
      kit: "FormControl isInvalid + FormErrorMessage",
      note: "first failing message, after the box is toggled",
    },
  },
);

export const Checkbox = createComponentImplementation(CheckboxApi, ({ props }) => {
  const { error, markTouched } = useFieldError(props);
  return (
    <KitFormControl isDisabled={props.isDisabled === true} isInvalid={error !== undefined}>
      <KitCheckbox
        {...identityProps(KitCheckbox, props, mapping.identityKeys)}
        isChecked={props.value === true}
        onChange={(event) => {
          props.setValue(event.target.checked);
          markTouched();
        }}
        isInvalid={error !== undefined}
      >
        {props.label}
      </KitCheckbox>
      {error === undefined ? null : <KitFormErrorMessage>{error}</KitFormErrorMessage>}
    </KitFormControl>
  );
});
