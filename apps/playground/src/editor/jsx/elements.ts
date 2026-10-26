import { COMPONENT_MAPPINGS, ICON_KIT_NAMES } from "@agentic-ui/ui-kit-one-react";
import {
  attribute,
  bindingExpression,
  textChild,
  valueExpression,
  type Scope,
} from "./expressions.ts";
import { element, fragment, mapNode, type JsxChild, type JsxNode } from "./nodes.ts";

type Props = Readonly<Record<string, unknown>>;
export type RenderChild = (id: string, scope: Scope) => JsxNode;
export type RenderChildren = (
  children: unknown,
  scope: Scope,
  wrap?: (child: JsxNode) => JsxNode,
) => JsxChild[];

const identityAttributes = (
  component: string,
  props: Props,
  scope: Scope,
  skip: readonly string[] = [],
) => {
  const mapping = COMPONENT_MAPPINGS.find((candidate) => candidate.component === component);
  return Object.entries(props)
    .filter(([name]) => mapping?.props[name]?.identity === true && !skip.includes(name))
    .map(([name, value]) => attribute(name, value, scope));
};

const binding = (value: unknown, scope: Scope) => valueExpression(value, scope);
const setter = (value: unknown, scope: Scope, read: string, parameter = "event") =>
  typeof value === "object" && value !== null && "path" in value
    ? `{(${parameter}) => set(${JSON.stringify(bindingExpression(String((value as { path: string }).path), scope))}, ${read})}`
    : "{() => {}}";

/** JSX for one contract component, using the kit components the renderer renders. */
export function componentElement(
  component: string,
  props: Props,
  scope: Scope,
  child: RenderChild,
  children: RenderChildren,
): JsxNode {
  const identity = (skip?: readonly string[]) => identityAttributes(component, props, scope, skip);
  const label = props.label === undefined ? "" : textChild(props.label, scope);
  switch (component) {
    case "Button": {
      const event = (props.action as { event?: { name: string; context?: unknown } } | undefined)
        ?.event;
      const icons = (["leftIcon", "rightIcon"] as const)
        .filter((key) => typeof props[key] === "string")
        .map((key) => `${key}={<${ICON_KIT_NAMES[props[key] as keyof typeof ICON_KIT_NAMES]} />}`);
      const onClick = event
        ? `onClick={() => send(${JSON.stringify(event.name)}${event.context ? `, ${valueExpression(event.context, scope)}` : ""})}`
        : "onClick={run}";
      return element(
        "Button",
        [...identity(), ...icons, onClick, ...(props.checks ? ["isDisabled={!checksPass}"] : [])],
        [label],
      );
    }
    case "Input":
      return element("FormControl", props.isRequired === true ? ["isRequired"] : [], [
        element("FormLabel", [], [label]),
        element("Input", [
          ...identity(),
          `value={${binding(props.value, scope)}}`,
          `onChange=${setter(props.value, scope, "event.target.value")}`,
        ]),
        props.helperText === undefined
          ? ""
          : element("FormHelperText", [], [textChild(props.helperText, scope)]),
      ]);
    case "Checkbox":
      return element(
        "Checkbox",
        [
          ...identity(),
          `isChecked={${binding(props.value, scope)}}`,
          `onChange=${setter(props.value, scope, "event.target.checked")}`,
        ],
        [label],
      );
    case "Switch":
      return element(
        "FormControl",
        ['display="flex"', 'alignItems="center"'],
        [
          element("Switch", [
            ...identity(),
            `isChecked={${binding(props.value, scope)}}`,
            `onChange=${setter(props.value, scope, "event.target.checked")}`,
          ]),
          element("FormLabel", ["mb={0}"], [label]),
        ],
      );
    case "RadioGroup": {
      const options = Array.isArray(props.options)
        ? (props.options as Array<{ label: string; value: string }>)
        : [];
      const radios = options.map((option) =>
        element("Radio", [attribute("value", option.value, scope)], [option.label]),
      );
      return element(
        "FormControl",
        ['as="fieldset"'],
        [
          element("FormLabel", ['as="legend"'], [label]),
          element(
            "RadioGroup",
            [
              `value={${binding(props.value, scope)}}`,
              `onChange=${setter(props.value, scope, "value", "value")}`,
            ],
            [
              element(
                "Stack",
                props.direction ? [attribute("direction", props.direction, scope)] : [],
                radios,
              ),
            ],
          ),
        ],
      );
    }
    case "List": {
      const kit =
        props.variant === "ordered"
          ? "OrderedList"
          : props.variant === "unordered"
            ? "UnorderedList"
            : "List";
      return element(
        kit,
        identity(),
        children(props.children, scope, (item) => element("ListItem", [], [item])),
      );
    }
    case "Table": {
      const columns = Array.isArray(props.columns)
        ? (props.columns as Array<{ header: string; key: string }>)
        : [];
      const head = element(
        "Thead",
        [],
        [
          element(
            "Tr",
            [],
            columns.map((column) => element("Th", [], [column.header])),
          ),
        ],
      );
      const cells = columns.map((column) =>
        element("Td", [], [`{row[${JSON.stringify(column.key)}]}`]),
      );
      const body = element(
        "Tbody",
        [],
        [mapNode(binding(props.rows, scope), "row", element("Tr", [], cells))],
      );
      return element("Table", identity(), [
        head,
        body,
        props.caption === undefined
          ? ""
          : element("TableCaption", [], [textChild(props.caption, scope)]),
      ]);
    }
    case "Modal":
      return fragment([
        child(String(props.trigger), scope),
        element(
          "Modal",
          [
            ...identity(),
            props.open === undefined ? "isOpen={isOpen}" : `isOpen={${binding(props.open, scope)}}`,
            "onClose={close}",
          ],
          [
            element("ModalOverlay"),
            element(
              "ModalContent",
              [],
              [
                props.title === undefined
                  ? ""
                  : element("ModalHeader", [], [textChild(props.title, scope)]),
                element("ModalCloseButton"),
                element("ModalBody", [], [child(String(props.content), scope)]),
              ],
            ),
          ],
        ),
      ]);
    case "Tabs": {
      const tabs = Array.isArray(props.tabs)
        ? (props.tabs as Array<{ title: unknown; child: string }>)
        : [];
      const index =
        props.selectedIndex === undefined ? [] : [`index={${binding(props.selectedIndex, scope)}}`];
      return element(
        "Tabs",
        [...identity(), ...index],
        [
          element(
            "TabList",
            [],
            tabs.map((tab) => element("Tab", [], [textChild(tab.title, scope)])),
          ),
          element(
            "TabPanels",
            [],
            tabs.map((tab) => element("TabPanel", [], [child(tab.child, scope)])),
          ),
        ],
      );
    }
    case "Icon":
      return element(
        ICON_KIT_NAMES[props.name as keyof typeof ICON_KIT_NAMES] ?? "Icon",
        identity(),
      );
    default: {
      const mapping = COMPONENT_MAPPINGS.find((candidate) => candidate.component === component);
      const text = props.text ?? props.label;
      const content =
        text === undefined ? children(props.children, scope) : [textChild(text, scope)];
      return element(mapping?.kit[0] ?? component, identity(), content);
    }
  }
}
