import { z } from "zod";

/**
 * What a prop is for (SV-C22). Every prop of every component carries exactly one kind, declared
 * where its Zod schema is written; the catalog rules, the Interactions section, the two-way list
 * and the docs are generated from these kinds.
 */
export const PROP_KINDS = {
  style: "fixed theme token: one literal value of the token list, never a binding or function call",
  option: "fixed literal setting (enum, number, boolean or literal list), never a binding",
  content: "agent data shown by the component: a literal, a data binding or a function call",
  "two-way": "bound to a data-model path the renderer writes the user's changes back to",
  child: "component id(s) rendered in place",
  trigger: "component id rendered in place whose press opens this component locally",
  action: "what a press does: an event sent to the agent, or a local function call",
  checks: "validation rules: boolean function calls with a message",
} as const;

export type PropKind = keyof typeof PROP_KINDS;

/** Theme token groups of `style` props (SV-C21: colours, colorScheme, spacing, sizes, …). */
export const STYLE_GROUPS = {
  color: "colour tokens",
  colorScheme: "palette names",
  space: "spacing tokens (margin, padding, gap)",
  size: "box size tokens (width, height)",
  border: "border width tokens",
  radius: "corner radius tokens",
  shadow: "shadow tokens",
  typography: "type scale and alignment tokens",
  variant: "component variant and size tokens",
} as const;

export type StyleGroup = keyof typeof STYLE_GROUPS;

/** Component roles: what a component is for (components/index.ts COMPONENT_ROLES). */
export const COMPONENT_ROLE_NAMES = {
  page: "the page column, usually the root",
  layout: "containers that arrange and space their children",
  text: "typography",
  action: "pressable controls",
  input: "form fields",
  data: "lists and tables",
  status: "status and category labels",
  overlay: "dialogs and tabbed panels",
  media: "pictures and icons",
} as const;

export type ComponentRole = keyof typeof COMPONENT_ROLE_NAMES;

export interface PropMeta {
  readonly kind: PropKind;
  /** Token group, for `style` props only. */
  readonly group?: StyleGroup;
}

/** Appended to every style prop description, so the catalog itself states SV-C21. */
export const STYLE_NOTE = "Literal token only; never a binding or function call.";

const META = new WeakMap<z.ZodTypeAny, PropMeta>();

function mark<T extends z.ZodTypeAny>(schema: T, meta: PropMeta): T {
  META.set(schema, meta);
  return schema;
}

type Tokens = readonly [string, ...string[]];
type Mutable<T extends Tokens> = [T[0], ...T[number][]];

/**
 * Prop factories. `prop.style` builds the whole optional enum (so a style prop can only be a token
 * list); the others tag a finished schema. Apply them to the schema exactly as it sits in the
 * component shape (after `.optional()`): the registry is keyed by that schema object.
 */
export const prop = {
  style<const T extends Tokens>(group: StyleGroup, values: T, description: string) {
    const schema = z
      .enum(values as unknown as Mutable<T>)
      .describe(`${description} ${STYLE_NOTE}`)
      .optional();
    return mark(schema, { kind: "style", group });
  },
  option: <T extends z.ZodTypeAny>(schema: T) => mark(schema, { kind: "option" }),
  content: <T extends z.ZodTypeAny>(schema: T) => mark(schema, { kind: "content" }),
  twoWay: <T extends z.ZodTypeAny>(schema: T) => mark(schema, { kind: "two-way" }),
  child: <T extends z.ZodTypeAny>(schema: T) => mark(schema, { kind: "child" }),
  trigger: <T extends z.ZodTypeAny>(schema: T) => mark(schema, { kind: "trigger" }),
  action: <T extends z.ZodTypeAny>(schema: T) => mark(schema, { kind: "action" }),
  checks: <T extends z.ZodTypeAny>(schema: T) => mark(schema, { kind: "checks" }),
};

/** The kind of a prop schema taken from a component shape; undefined when it has none. */
export function propMeta(schema: z.ZodTypeAny): PropMeta | undefined {
  return META.get(schema);
}
