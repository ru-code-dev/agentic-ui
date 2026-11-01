/** Helpers deriving the token-name enums agents use from the token value records. */
export type NonEmpty<T> = readonly [T, ...T[]];

export const keysOf = <T extends object>(record: T) =>
  Object.keys(record) as Array<keyof T & string>;

export const nonEmpty = <T>(values: T[]) => values as unknown as NonEmpty<T>;

/**
 * A subset of a token or option list (DEC-046): `pickTokens(controlSizes, ["sm", "md"])` exposes
 * only those values to the model; the renderer passes them through unchanged. A picked value that
 * is not in `source` is a compile error (and throws at import).
 */
export function pickTokens<
  const S extends readonly string[],
  const P extends readonly [S[number], ...S[number][]],
>(source: S, picked: P): P {
  const unknown = picked.filter((value) => !source.includes(value));
  if (unknown.length > 0)
    throw new Error(`pickTokens: not in the source list: ${unknown.join(", ")}`);
  return picked;
}
