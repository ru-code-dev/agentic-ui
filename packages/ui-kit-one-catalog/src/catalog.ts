import { Catalog, type ComponentApi, type FunctionApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { CATALOG_ID } from "./catalog-id.ts";
import { COMPONENT_APIS, COMPONENT_ROLES } from "./components/index.ts";
import { assertCompleteContract } from "./contract-checks.ts";
import { FUNCTION_APIS, FUNCTION_USES } from "./functions.ts";
import { buildInstructions, type ContractSource } from "./rules/index.ts";

export const PROTOCOL_VERSION = "v0.9";

const COMMON_TYPES_URI = "https://a2ui.org/specification/v0_9/common_types.json";

/** ui-kit-one has no per-surface theme properties: the kit owns its look. */
const ThemeSchema = z.object({}).strict().describe("ui-kit-one accepts no theme properties.");

assertCompleteContract(COMPONENT_APIS);

/** The contract and its metadata, as the rule generators read it (SV-C22). */
export const CONTRACT_SOURCE: ContractSource = {
  components: COMPONENT_APIS,
  functions: FUNCTION_APIS,
  roles: COMPONENT_ROLES,
  functionUses: FUNCTION_USES,
};

/**
 * Rules for agents, shipped in the catalog document (`instructions`) and so in every prompt:
 * generated from the prop kinds, component roles and function uses (src/rules/).
 */
export const CATALOG_INSTRUCTIONS = buildInstructions(CONTRACT_SOURCE);

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

/**
 * A contract catalog for `source`: completeness-checked, with instructions generated from it. The
 * shipped contract is `createContract(CONTRACT_SOURCE)`; tests feed fixture sources through the
 * same path (catalog.json → prompt → rules → interactions).
 */
export function createContract(source: ContractSource): Catalog<ComponentApi, FunctionApi> {
  assertCompleteContract(source.components);
  const roleless = source.components.filter((api) => source.roles[api.name] === undefined);
  if (roleless.length > 0)
    throw new Error(
      `No role (components/index.ts COMPONENT_ROLES): ${roleless.map((api) => api.name).join(", ")}`,
    );
  return new Catalog<ComponentApi, FunctionApi>(
    CATALOG_ID,
    PROTOCOL_VERSION,
    [...source.components],
    [...source.functions],
    { ...CATALOG_OPTIONS, instructions: buildInstructions(source) },
  );
}

/** The contract: component and function APIs without implementations. */
export const uiKitOneContract = createContract(CONTRACT_SOURCE);

/** The spec-compliant v0.9 catalog document (`dist/catalog.json`) of `contract`. */
export function buildCatalogJson(
  contract: Catalog<ComponentApi, FunctionApi> = uiKitOneContract,
): Record<string, unknown> {
  return contract.toJson();
}
