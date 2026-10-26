import { STYLE_PROP_NAMES } from "@agentic-ui/ui-kit-one-catalog";
import type { KitStyleProps } from "./kit/index.ts";

type StylePropName = (typeof STYLE_PROP_NAMES)[number];

/**
 * The contract's StyleProps present on `props`, as kit props. Names are identical in ui-kit-one
 * and Chakra UI v1, and every value is a token the kit theme defines.
 */
export function styleProps(props: {
  readonly [K in StylePropName]?: string | undefined;
}): KitStyleProps {
  const picked: Partial<Record<StylePropName, string>> = {};
  for (const name of STYLE_PROP_NAMES) {
    const value = props[name];
    if (value !== undefined) picked[name] = value;
  }
  return picked as KitStyleProps;
}
