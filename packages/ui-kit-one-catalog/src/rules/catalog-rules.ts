import type { PropView } from "../contract-view.ts";
import { byComponents, list, view, type ContractSource } from "./source.ts";

/** Palettes the status example shows, per status component only those it accepts (else its first three). */
const STATUS_TONES = ["green", "orange", "red"];

const isStyle = (p: PropView) => p.kind === "style";
const inGroup =
  (...groups: string[]) =>
  (p: PropView) =>
    groups.includes(p.group ?? "");

/**
 * Catalog rules generated from the prop kinds, component roles and function uses (SV-C22). Every
 * component, prop, token group and function named here comes from the contract source.
 */
export function catalogRules(source: ContractSource): string[] {
  const v = view(source);
  const spaced = v.components(inGroup("space", "size"));
  const layout = v.ofRole("layout").filter((name) => spaced.includes(name));
  const unspaced = source.components
    .map((api) => api.name)
    .filter((name) => !spaced.includes(name));
  const status = v.ofRole("status");
  const paletteProps = v.where((p) => status.includes(p.component) && p.group === "colorScheme");
  const statusPalette = v.unique(paletteProps.map((p) => p.name));
  // Each status component with the palette values it accepts: never a colour one of them would reject.
  const statusExample = status
    .map((component) => paletteProps.filter((p) => p.component === component))
    .filter((own) => own.length > 0)
    .map((own) => {
      const values = v.unique(own.flatMap((p) => p.values));
      const tones = STATUS_TONES.filter((tone) => values.includes(tone));
      const shown = tones.length > 0 ? tones : values.slice(0, 3);
      return `${own[0]?.component} ${list(v.unique(own.map((p) => p.name)))} ${shown.join(" / ")}`;
    })
    .join("; ");
  const statusText = v.names((p) => status.includes(p.component) && p.kind === "content");
  const templates = v.where((p) => p.ref === "ChildList");
  const ids = v.where((p) => (p.kind === "child" || p.kind === "trigger") && p.ref !== "ChildList");
  const checked = v.components((p) => p.kind === "checks");
  const submit = v.components((p) => p.kind === "action" && checked.includes(p.component));
  const uses = Object.entries(source.functionUses).filter(([name]) =>
    source.functions.some((fn) => fn.name === name),
  );

  return [
    `- Style props take exactly one literal token from their list, never a {"path"} binding and never a function call: ${list(v.names(isStyle))}.`,
    `- Setting props are literal values too, never bound: ${list(v.names((p) => p.kind === "option"))}.`,
    `- Data bindings and function calls are for content props only: ${list(v.names((p) => p.kind === "content"))}.`,
    `- State colours: for a few fixed rows write each row explicitly with literal tokens (e.g. ${statusExample}). In a ChildList template every item gets the same props: give the ${status.join(", ")} one fixed ${list(statusPalette)} (or none) and bind only its ${list(statusText)}.`,
    `- Margin, padding, gap, width and height props exist only here: ${byComponents(v.where(inGroup("space", "size")))}.`,
    `- ${list(unspaced)} have no margin, padding, gap, width or height props: wrap them in ${list(layout)} for spacing.`,
    `- The root (id "root") is usually ${list(v.ofRole("page"))}, the centred page column; centre a page with it, never with auto margins.`,
    `- Id props: ${byComponents([...templates, ...ids])}. Every id they name must be a component of the same updateComponents message.`,
    `- ${byComponents(templates)} take an array of ids or ONE template object {"componentId": "<id>", "path": "/<array>"} (an object, never an array of templates); inside the template, paths are relative to the item.`,
    `- Validate with checks on ${list(checked)}: each rule is {"condition": <boolean call: ${list(v.returning("boolean"))}>, "message": "..."}; give the submit ${list(submit)} the same checks so it stays disabled until the form is valid.`,
    ...uses.map(([name, use]) => `- Use ${name} for ${use}.`),
  ];
}
