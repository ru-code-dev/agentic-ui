import { useEffect, useMemo, useState } from "react";
import { parseMessages, type ParseResult } from "../editor/parse-messages.ts";
import { validateSource, type SchemaIssue } from "../editor/validation.ts";

export interface Analysis {
  readonly parse: ParseResult;
  readonly issue: SchemaIssue | undefined;
}

const DEBOUNCE_MS = 300;

/** Parses and validates the editor content, debounced while the user types (PG-05). */
export function useAnalysis(source: string): Analysis {
  const [settled, setSettled] = useState(source);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(source), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [source]);
  return useMemo(() => {
    const parse = parseMessages(settled);
    return { parse, issue: parse.ok ? validateSource(settled, parse.messages) : undefined };
  }, [settled]);
}
