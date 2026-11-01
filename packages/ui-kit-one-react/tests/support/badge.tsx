import { spec } from "@a2ui/web_core/catalog";
import { Catalog, DynamicStringSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import type { ReactComponentImplementation } from "@a2ui/react/v0_9";
import {
  CATALOG_ID,
  CATALOG_OPTIONS,
  PROTOCOL_VERSION,
  pickTokens,
  controlSizes,
} from "@agentic-ui/ui-kit-one-catalog";
import type { ComponentType, ReactNode } from "react";
import { z } from "zod";

/** A kit facade with literal prop types, so the passthrough proof has real values to check. */
export interface FakeBadgeProps {
  readonly size?: "sm" | "md" | "lg";
  readonly colorScheme?: "gray" | "green" | "red";
  readonly density?: "compact" | "cozy";
  readonly children?: ReactNode;
}
export const FakeBadge: ComponentType<FakeBadgeProps> = ({
  size,
  colorScheme,
  density,
  children,
}) => (
  <span data-testid="badge" data-size={size} data-color-scheme={colorScheme} data-density={density}>
    {children}
  </span>
);

/** Contract: `size` = a subset of the kit sizes, `colorScheme` = renamed values, `density` hidden. */
export const BadgeApi = {
  name: "Badge",
  schema: spec(
    z
      .object({
        label: DynamicStringSchema.describe("Badge text."),
        size: z.enum(pickTokens(controlSizes, ["sm", "md"])).optional(),
        colorScheme: z.enum(["neutral", "success", "danger"]).optional(),
      })
      .strict(),
    { mixins: ["ComponentCommon"] },
  ),
} satisfies ComponentApi;

/** The contract's own values for the renamed prop, and the kit values they render as. */
export const BADGE_SCHEMES = { neutral: "gray", success: "green", danger: "red" } as const;

/** A catalog holding only the fixture, under the contract's id. */
export const badgeCatalog = (implementation: ReactComponentImplementation) =>
  new Catalog<ReactComponentImplementation>(
    CATALOG_ID,
    PROTOCOL_VERSION,
    [implementation],
    [],
    CATALOG_OPTIONS,
  );
