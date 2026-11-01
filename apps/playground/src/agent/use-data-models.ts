import type { Surface } from "@agentic-ui/a2ui-react";
import { useEffect, useState } from "react";

const plain = (value: unknown): unknown =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

/** The live data model of every surface (inputs included), by surfaceId, for a Data model tab. */
export function useDataModels(surfaces: readonly Surface[]): Readonly<Record<string, unknown>> {
  const [models, setModels] = useState<Readonly<Record<string, unknown>>>({});
  useEffect(() => {
    const read = () =>
      setModels(Object.fromEntries(surfaces.map((s) => [s.id, plain(s.dataModel.get("/"))])));
    read();
    const subscriptions = surfaces.map((surface) => surface.dataModel.subscribe("/", read));
    return () => {
      for (const subscription of subscriptions) subscription.unsubscribe();
    };
  }, [surfaces]);
  return models;
}
