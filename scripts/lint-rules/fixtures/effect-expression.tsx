// OWN-01 fixture: expression-bodied effect callbacks (each returns its value to React as the "cleanup").
import { useEffect, useLayoutEffect } from "react";
import * as React from "react"; // oxlint-disable-line import/no-namespace -- fixture: React.useEffect form

export function Scroller({ end }: { end: { current: HTMLElement | null } }) {
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [end]);
  useLayoutEffect(() => void end.current?.focus(), [end]);
  React.useInsertionEffect(() => end.current?.blur());
  return null;
}
