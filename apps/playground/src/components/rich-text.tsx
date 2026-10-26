import { Fragment } from "react";

/** Splits text into plain and `code` segments, keyed by their start offset. */
function segments(text: string): Array<{ offset: number; part: string }> {
  let offset = 0;
  return text.split(/(`[^`]+`)/).map((part) => {
    const segment = { offset, part };
    offset += part.length;
    return segment;
  });
}

/** Renders `code` spans written with backticks in contract descriptions. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {segments(text).map(({ offset, part }) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code
            key={offset}
            className="rounded bg-white/[0.06] px-1 py-px font-mono text-[0.92em] text-foreground/90"
          >
            {part.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={offset}>{part}</Fragment>
        ),
      )}
    </>
  );
}
