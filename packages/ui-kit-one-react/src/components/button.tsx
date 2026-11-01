import { createComponentImplementation } from "@a2ui/react/v0_9";
import { ButtonApi } from "@agentic-ui/ui-kit-one-catalog";
import { useActionScope, useInTrigger } from "../action-scope.ts";
import { ICONS } from "../icon-map.ts";
import { Button as KitButton } from "../kit/index.ts";
import { componentMapping, identityProps } from "../mapping.ts";

export const mapping = componentMapping(ButtonApi, ["Button"], {
  label: { kit: "children" },
  action: {
    kit: "onClick",
    note: "dispatches the action; an event also notifies an enclosing Modal (closeOnAction); inside a Modal trigger an event is not sent (the press only opens the modal)",
  },
  leftIcon: { kit: "leftIcon", note: "icon name → kit icon element (see Icons)" },
  rightIcon: { kit: "rightIcon", note: "icon name → kit icon element (see Icons)" },
  isDisabled: { kit: "isDisabled", note: "also true while any check fails" },
  checks: { kit: "isDisabled", note: "disabled while any check fails" },
});

/** True for `{ event: … }` actions (sent to the agent), false for local `{ functionCall: … }`. */
function firesEvent(action: unknown): boolean {
  return typeof action === "object" && action !== null && "event" in action;
}

export const Button = createComponentImplementation(ButtonApi, ({ props, context }) => {
  const notifyActionScope = useActionScope();
  const inTrigger = useInTrigger();
  const LeftIcon = props.leftIcon === undefined ? undefined : ICONS[props.leftIcon];
  const RightIcon = props.rightIcon === undefined ? undefined : ICONS[props.rightIcon];
  const press = async () => {
    const event = firesEvent(context.componentModel.properties["action"]);
    if (event && inTrigger) return;
    await props.action();
    if (event) notifyActionScope();
  };
  return (
    <KitButton
      {...identityProps(KitButton, props, mapping.identityKeys)}
      isDisabled={props.isDisabled === true || props.isValid === false}
      {...(LeftIcon === undefined ? {} : { leftIcon: <LeftIcon aria-hidden /> })}
      {...(RightIcon === undefined ? {} : { rightIcon: <RightIcon aria-hidden /> })}
      onClick={() => void press()}
    >
      {props.label}
    </KitButton>
  );
});
