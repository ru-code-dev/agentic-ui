import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readSpecSchema, SPEC_CATALOG_ALIAS } from "./spec-schemas.ts";

/**
 * Compiles `catalog` the way the A2UI v0.9 spec test suite does: JSON Schema 2020-12, the spec's
 * `common_types.json` and `server_to_client.json`, and the catalog registered under the
 * `catalog.json` alias the envelope refers to. Compiling also checks the catalog against the
 * 2020-12 meta-schema. Returns a validator for one server-to-client message.
 */
export function compileMessageValidator(catalog: Record<string, unknown>): ValidateFunction {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats.default(ajv);
  ajv.addSchema(readSpecSchema("common_types.json"));
  ajv.addSchema({ ...catalog, $id: SPEC_CATALOG_ALIAS });
  return ajv.compile(readSpecSchema("server_to_client.json"));
}
