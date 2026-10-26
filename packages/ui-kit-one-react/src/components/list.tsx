import { createComponentImplementation } from "@a2ui/react/v0_9";
import { ListApi } from "@agentic-ui/ui-kit-one-catalog";
import { renderChildren } from "../children.tsx";
import {
  List as KitList,
  ListItem as KitListItem,
  OrderedList as KitOrderedList,
  UnorderedList as KitUnorderedList,
} from "../kit/index.ts";
import { componentMapping, identityProps } from "../mapping.ts";

const VARIANT = { unordered: KitUnorderedList, ordered: KitOrderedList, plain: KitList } as const;

export const mapping = componentMapping(
  ListApi,
  ["UnorderedList", "OrderedList", "List", "ListItem"],
  {
    children: {
      kit: "ListItem per child",
      note: "static ids or a template over a data-model array",
    },
    variant: {
      kit: "list component",
      values: { unordered: "UnorderedList", ordered: "OrderedList", plain: "List" },
      note: "plain when omitted",
    },
  },
);

export const List = createComponentImplementation(ListApi, ({ props, buildChild }) => {
  const KitVariant = VARIANT[props.variant ?? "plain"];
  return (
    <KitVariant {...identityProps(KitList, props, mapping.identityKeys)}>
      {renderChildren(props.children, buildChild, (child, key) => (
        <KitListItem key={key}>{child}</KitListItem>
      ))}
    </KitVariant>
  );
});
