import { useEffect, useState } from "react";
import { loadCounter, type TokenCounter, type TokenizerId } from "./tokenizers.ts";

/** The selected tokenizer, loaded lazily; undefined while it loads. */
export function useCounter(id: TokenizerId): TokenCounter | undefined {
  const [counter, setCounter] = useState<TokenCounter>();
  useEffect(() => {
    let current = true;
    setCounter(undefined);
    void loadCounter(id).then((loaded) => {
      if (current) setCounter(loaded);
    });
    return () => {
      current = false;
    };
  }, [id]);
  return counter;
}
