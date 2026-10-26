import { createComponentImplementation } from "@a2ui/react/v0_9";
import { SwitchApi } from "@agentic-ui/ui-kit-one-catalog";
import { useId } from "react";
import {
  FormControl as KitFormControl,
  FormLabel as KitFormLabel,
  Switch as KitSwitch,
} from "../kit/index.ts";
import { componentMapping, identityProps } from "../mapping.ts";

export const mapping = componentMapping(SwitchApi, ["FormControl", "Switch", "FormLabel"], {
  label: { kit: "FormLabel (htmlFor the switch)" },
  value: {
    kit: "Switch isChecked / onChange",
    note: "two-way: toggling writes true/false to the bound path",
  },
});

export const Switch = createComponentImplementation(SwitchApi, ({ props }) => {
  const id = useId();
  return (
    <KitFormControl display="flex" alignItems="center" isDisabled={props.isDisabled === true}>
      <KitSwitch
        {...identityProps(KitSwitch, props, mapping.identityKeys)}
        id={id}
        isChecked={props.value === true}
        onChange={(event) => props.setValue(event.target.checked)}
      />
      <KitFormLabel htmlFor={id} mb={0}>
        {props.label}
      </KitFormLabel>
    </KitFormControl>
  );
});
