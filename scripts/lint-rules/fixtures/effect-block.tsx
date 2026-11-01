// OWN-01 fixture: block-bodied effects, with and without a cleanup, pass.
import { useEffect } from "react";

export function Ticker({ end }: { end: { current: HTMLElement | null } }) {
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [end]);
  useEffect(() => {
    const timer = setInterval(() => {}, 250);
    return () => clearInterval(timer);
  }, []);
  return null;
}
