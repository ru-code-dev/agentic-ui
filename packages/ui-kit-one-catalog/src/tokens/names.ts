/** Helpers deriving the token-name enums agents use from the token value records. */
export type NonEmpty<T> = readonly [T, ...T[]];

export const keysOf = <T extends object>(record: T) =>
  Object.keys(record) as Array<keyof T & string>;

export const nonEmpty = <T>(values: T[]) => values as unknown as NonEmpty<T>;
