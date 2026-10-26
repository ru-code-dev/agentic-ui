export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

/** 1-based line and column of a character offset in `source`. */
export function positionAt(source: string, offset: number): SourcePosition {
  const before = source.slice(0, Math.max(0, Math.min(offset, source.length)));
  const lines = before.split("\n");
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

/** Character offset of a 1-based line and column. */
export function offsetAt(source: string, { line, column }: SourcePosition): number {
  const lines = source.split("\n");
  return lines.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0) + column - 1;
}
