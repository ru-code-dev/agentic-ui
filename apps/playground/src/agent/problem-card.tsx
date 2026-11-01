import { TriangleAlert } from "lucide-react";
import type { ResponseProblem } from "@agentic-ui/a2ui-react/core";

/**
 * DEC-054 placeholder: what the page could not use, with the request, the HTTP status, what is
 * wrong and an excerpt of the raw answer. Shown instead of the UI (a turn) or as a page notice.
 */
export function ProblemCard({
  problem,
  testId = "turn-problem",
}: {
  problem: ResponseProblem;
  testId?: string;
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      data-kind={problem.kind}
      className="flex flex-col gap-1.5 rounded-md border border-destructive/40 bg-destructive/[0.07] px-3 py-2 text-[12.5px]"
    >
      <p className="flex items-start gap-1.5 font-medium text-destructive-foreground">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span data-testid="problem-title">{problem.title}</span>
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
        <dt>Запрос</dt>
        <dd className="font-mono" data-testid="problem-request">
          {problem.request}
        </dd>
        <dt>HTTP</dt>
        <dd className="font-mono" data-testid="problem-status">
          {problem.httpStatus ?? "нет ответа"}
        </dd>
      </dl>
      {problem.details.length === 0 ? null : (
        <ul
          className="flex flex-col gap-0.5 pl-4 font-mono text-[11.5px] text-muted-foreground"
          data-testid="problem-details"
        >
          {problem.details.map((detail) => (
            <li key={detail} className="list-disc break-words">
              {detail}
            </li>
          ))}
        </ul>
      )}
      {problem.excerpt === "" ? null : (
        <details className="text-[11.5px]">
          <summary className="cursor-pointer text-muted-foreground">
            Ответ сервера (фрагмент)
          </summary>
          <pre
            className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-black/20 p-2 font-mono text-[11px]"
            data-testid="problem-excerpt"
          >
            {problem.excerpt}
          </pre>
        </details>
      )}
    </div>
  );
}
