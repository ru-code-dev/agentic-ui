import type { FunctionImplementation } from "@a2ui/web_core/v0_9";
import { z } from "zod";

/** Check functions: a value they cannot read (absent, null, "" for a number, wrong type) fails the check. */
const CHECKS = new Set(["required", "regex", "length", "numeric", "email"]);
/** Format functions: an absent or empty value formats as "". */
const FORMATS = new Set(["formatNumber", "formatCurrency", "formatDate", "pluralize"]);

/** The wrapper parses with the original schema itself, so the invoker passes the arguments through. */
const RAW_ARGS = z.record(z.string(), z.unknown());

const isEmpty = (value: unknown): boolean => value === undefined || value === null || value === "";

function totalCheck(fn: FunctionImplementation): FunctionImplementation {
  return {
    ...fn,
    schema: RAW_ARGS,
    execute: (args, context, abortSignal) => {
      const parsed = fn.schema.safeParse(args);
      if (parsed.success) {
        return fn.execute(parsed.data, context, abortSignal);
      }
      // Only the checked value is at fault: the check fails. A wrong `min`, `pattern`, … is the
      // agent's mistake and still throws (the invoker reports it as an expression error, DEC-063).
      if (parsed.error.issues.every((issue) => issue.path[0] === "value")) {
        return false;
      }
      throw parsed.error;
    },
  };
}

function totalFormat(fn: FunctionImplementation): FunctionImplementation {
  return {
    ...fn,
    schema: RAW_ARGS,
    execute: (args, context, abortSignal) =>
      isEmpty(args.value) ? "" : fn.execute(fn.schema.parse(args), context, abortSignal),
  };
}

/**
 * Makes web_core's check and format functions total for what an untouched or cleared form field
 * holds (A6-02): a check fails (its message shows, the submit stays disabled) instead of throwing,
 * a format gives "". Renderer-only: the server and the page store do not evaluate functions.
 */
export function totalFunctions(
  functions: readonly FunctionImplementation[],
): FunctionImplementation[] {
  return functions.map((fn) => {
    if (CHECKS.has(fn.name)) return totalCheck(fn);
    if (FORMATS.has(fn.name)) return totalFormat(fn);
    return fn;
  });
}
