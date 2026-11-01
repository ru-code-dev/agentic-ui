// oxlint-disable-next-line import/no-namespace -- name-indexed lookup table (DEC-050)
import * as values from "./values.ts";

/** A reasoned disable on the namespace import is honoured (the icon-map.ts exception). */
export const VALUES = { first: values.a, second: values.b };
