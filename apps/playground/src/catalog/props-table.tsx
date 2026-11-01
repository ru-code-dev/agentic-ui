import { COMPONENT_APIS, STYLE_PROP_NAMES } from "@agentic-ui/ui-kit-one-catalog";
import { propDoc } from "@agentic-ui/ui-kit-one-catalog/docs";
import { COMPONENT_MAPPINGS } from "@agentic-ui/ui-kit-one-react";
import type { z } from "zod";
import { RichText } from "../components/rich-text.tsx";
import { Badge } from "../components/ui/badge.tsx";

/** Badge colour per prop kind: interactive kinds stand out. */
const KIND_VARIANT = { "two-way": "info", trigger: "info", action: "warning" } as const;

/** Contract props of a component with kind, type, values and kit mapping (from the Zod API). */
export function PropsTable({ name }: { name: string }) {
  const api = COMPONENT_APIS.find((candidate) => candidate.name === name);
  const mapping = COMPONENT_MAPPINGS.find((candidate) => candidate.component === name);
  if (api === undefined) return null;
  const shape = (api.schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
  const styleCount = STYLE_PROP_NAMES.filter((prop) => prop in shape).length;
  const props = Object.entries(shape).filter(
    ([prop]) =>
      !(styleCount === STYLE_PROP_NAMES.length && STYLE_PROP_NAMES.includes(prop as never)),
  );
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-left text-[12.5px]" data-testid="props-table">
        <thead className="bg-white/[0.02] text-[11px] text-muted-foreground uppercase tracking-wider">
          <tr className="border-b">
            <th className="px-3 py-2 font-medium">Prop</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Kit</th>
            <th className="px-3 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {props.map(([prop, schema]) => {
            const doc = propDoc(prop, schema);
            const kit = mapping?.props[prop];
            return (
              <tr key={prop} className="align-top">
                <td className="px-3 py-2 font-mono">
                  <span className="text-foreground">{prop}</span>
                  {doc.required ? (
                    <span className="ml-1 text-destructive-foreground">*</span>
                  ) : null}
                  {doc.kind === undefined ? null : (
                    <Badge
                      variant={KIND_VARIANT[doc.kind as keyof typeof KIND_VARIANT] ?? "outline"}
                      className="ml-1.5"
                      data-testid="prop-kind"
                    >
                      {doc.kind}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-[11.5px] text-muted-foreground">
                  {doc.type}
                  {doc.values === "" ? null : (
                    <div className="mt-0.5 max-w-56 whitespace-normal text-[11px] text-muted-foreground/80">
                      {doc.values.replaceAll("`", "")}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-[11.5px]">
                  {kit?.identity === true ? (
                    <span className="text-muted-foreground">identity</span>
                  ) : (
                    <span>{kit?.kit}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  <RichText text={doc.description} />
                </td>
              </tr>
            );
          })}
          {styleCount === STYLE_PROP_NAMES.length ? (
            <tr>
              <td className="px-3 py-2 font-mono">style props</td>
              <td className="px-3 py-2 font-mono text-[11.5px] text-muted-foreground">tokens</td>
              <td className="px-3 py-2 font-mono text-[11.5px] text-muted-foreground">identity</td>
              <td className="px-3 py-2 text-muted-foreground">{STYLE_PROP_NAMES.join(", ")}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
