import { Catalog, type ComponentApi, type FunctionApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { CATALOG_ID } from "./catalog-id.ts";
import { COMPONENT_APIS } from "./components/index.ts";
import { FUNCTION_APIS } from "./functions.ts";

export const PROTOCOL_VERSION = "v0.9";

const COMMON_TYPES_URI = "https://a2ui.org/specification/v0_9/common_types.json";

/** ui-kit-one has no per-surface theme properties: the kit owns its look. */
const ThemeSchema = z.object({}).strict().describe("ui-kit-one accepts no theme properties.");

/** Rules for agents, shipped in the catalog document (`instructions`) and so in every prompt. */
export const CATALOG_INSTRUCTIONS = [
  "ui-kit-one rules:",
  "- Use only the components, props and token values of this catalog. There is no free-form styling: no sx, CSS, pixel values or responsive objects.",
  "- Start every screen with one root component; Container is the usual page column.",
  '- Keep varying data (lists, table rows, form values, amounts) in updateDataModel and bind props to it with {"path": "/..."}; inside a ChildList template use paths relative to the item.',
  "- Inputs, Checkbox, RadioGroup, Switch, Modal.open and Tabs.selectedIndex write user changes back to their bound path; bind them, do not use literals.",
  "- Set sendDataModel: true in createSurface whenever the surface has inputs, so actions carry the form data.",
  '- Every Button needs an action. A Button used as a Modal trigger opens the modal by itself; give it an event action such as {"event": {"name": "modal.open"}}.',
  "- Validate inputs with checks (required, email, regex, length, numeric); give a submit Button the same checks to keep it disabled until the form is valid.",
  '- Format money with formatCurrency (or a Table column with format "currency"); never hard-code formatted amounts.',
  '- Format dates with formatDate and the pattern "dd.MM.yyyy" (the renderer locale is ru-RU and month names are not declined), or a Table column with format "date".',
].join("\n");

/** Options shared by the contract catalog and every renderer catalog of this contract. */
export const CATALOG_OPTIONS = {
  schemaUri: "https://json-schema.org/draft/2020-12/schema",
  schemaId: CATALOG_ID,
  title: "ui-kit-one",
  description: "Components and functions of the ui-kit-one UI kit.",
  declaredProtocolVersion: null,
  commonTypesUri: COMMON_TYPES_URI,
  themeSchema: ThemeSchema,
  instructions: CATALOG_INSTRUCTIONS,
};

/** The contract: component and function APIs without implementations. */
export const uiKitOneContract = new Catalog<ComponentApi, FunctionApi>(
  CATALOG_ID,
  PROTOCOL_VERSION,
  COMPONENT_APIS,
  FUNCTION_APIS,
  CATALOG_OPTIONS,
);

/** The spec-compliant v0.9 catalog document (`dist/catalog.json`). */
export function buildCatalogJson(): Record<string, unknown> {
  return uiKitOneContract.toJson();
}
