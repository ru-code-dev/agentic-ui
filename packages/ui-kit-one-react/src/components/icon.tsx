import { createComponentImplementation } from "@a2ui/react/v0_9";
import { IconApi } from "@agentic-ui/ui-kit-one-catalog";
import { ICONS } from "../icon-map.ts";
import { componentMapping, identityProps } from "../mapping.ts";

export const mapping = componentMapping(IconApi, ["icon components (kit/icons.ts)"], {
  name: { kit: "icon component", note: "icon name → kit icon (see Icons); rendered aria-hidden" },
});

export const Icon = createComponentImplementation(IconApi, ({ props }) => {
  const KitIcon = ICONS[props.name];
  return <KitIcon aria-hidden {...identityProps(KitIcon, props, mapping.identityKeys)} />;
});
