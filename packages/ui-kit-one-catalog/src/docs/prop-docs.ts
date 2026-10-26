import type { z } from "zod";
import { iconNames } from "../icons.ts";
import * as tokens from "../tokens/index.ts";

/** Documentation of one prop, read from its Zod schema. */
export interface PropDoc {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly values: string;
  readonly description: string;
  readonly items?: readonly PropDoc[];
}

/** Enums documented by name instead of listing every value. */
const NAMED_ENUMS = new Map<readonly string[], string>([
  [tokens.colorTokens, "color token"],
  [tokens.spaceTokens, "space token"],
  [iconNames, "icon name"],
]);

type AnyDef = { typeName: string; [key: string]: unknown };
const defOf = (schema: z.ZodTypeAny) => schema._def as AnyDef;

function describeRef(description: string | undefined): { ref: string | undefined; text: string } {
  if (description?.startsWith("REF:") !== true) return { ref: undefined, text: description ?? "" };
  const [ref, text = ""] = description.slice(4).split("|");
  return { ref: ref?.replace("#/$defs/", ""), text };
}

export function propDoc(name: string, schema: z.ZodTypeAny): PropDoc {
  let current = schema;
  let required = true;
  let description = schema.description;
  for (;;) {
    const def = defOf(current);
    if (def.typeName === "ZodOptional") required = false;
    else if (def.typeName !== "ZodDefault") break;
    current = def.innerType as z.ZodTypeAny;
    description ??= current.description;
  }
  const { ref, text } = describeRef(description ?? current.description);
  const def = defOf(current);
  if (ref !== undefined) return { name, type: ref, required, values: "", description: text };
  switch (def.typeName) {
    case "ZodEnum": {
      const values = def.values as readonly string[];
      const named = [...NAMED_ENUMS].find(
        ([list]) => list.length === values.length && list.every((v, i) => v === values[i]),
      );
      return {
        name,
        type: "enum",
        required,
        values: named ? `any ${named[1]}` : values.map((v) => `\`${v}\``).join(" "),
        description: text,
      };
    }
    case "ZodNumber": {
      const checks = (def.checks as Array<{ kind: string; value?: number }>) ?? [];
      const min = checks.find((c) => c.kind === "min")?.value;
      const max = checks.find((c) => c.kind === "max")?.value;
      const integer = checks.some((c) => c.kind === "int");
      const range = min === undefined ? "" : max === undefined ? `≥ ${min}` : `${min}–${max}`;
      return {
        name,
        type: integer ? "integer" : "number",
        required,
        values: range,
        description: text,
      };
    }
    case "ZodArray": {
      const element = def.type as z.ZodTypeAny;
      const elementRef = describeRef(element.description).ref;
      if (defOf(element).typeName === "ZodObject") {
        const shape = (element as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
        const items = Object.entries(shape).map(([key, value]) => propDoc(key, value));
        return {
          name,
          type: "array of objects",
          required,
          values: "",
          description: text,
          items,
        };
      }
      return {
        name,
        type: `array of ${elementRef ?? defOf(element).typeName.replace("Zod", "").toLowerCase()}`,
        required,
        values: "",
        description: text,
      };
    }
    default:
      return {
        name,
        type: def.typeName.replace("Zod", "").toLowerCase(),
        required,
        values: "",
        description: text,
      };
  }
}

export const cell = (value: string) =>
  value === "" ? "—" : value.replaceAll("|", "\\|").replaceAll("\n", " ");

export function propsTable(props: readonly PropDoc[]): string {
  const rows = props.map(
    (p) =>
      `| \`${p.name}\` | ${p.type} | ${p.required ? "yes" : "no"} | ${cell(p.values)} | ${cell(p.description)} |`,
  );
  return [
    "| Prop | Type | Required | Values | Description |",
    "|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}
