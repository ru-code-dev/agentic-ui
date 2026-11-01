import { A2UIChat, A2UIKitProvider, A2UISurface, useA2UIChat } from "@agentic-ui/a2ui-react";
import { useEffect, useState } from "react";
import type { DemoProps } from "../demo-props.ts";

const bubble = "max-w-[85%] rounded-lg px-3 py-1.5 text-[13px] whitespace-pre-wrap";
const button =
  "rounded-md border px-2.5 py-1 text-[12.5px] hover:bg-white/[0.06] disabled:opacity-50";

/**
 * Headless: the host draws everything itself from `turns`, `status`, `working`, `error` and calls `send`,
 * `cancel`, `retry`; only the surfaces come from the package (`<A2UISurface>`). Below: the default chat with
 * its render slots (working, error, failed UI, rejected UI) and `labels` instead of the built-in parts.
 */
export function HeadlessDemo({ connection, showSurfaces }: DemoProps) {
  const own = useA2UIChat({ endpoint: connection.endpoint, fetch: connection.fetch });
  const slotted = useA2UIChat({ endpoint: connection.endpoint, fetch: connection.fetch });
  const [text, setText] = useState("");
  useEffect(() => {
    showSurfaces([...own.surfaces, ...slotted.surfaces]); // playground only: the Data model tab
  }, [own.surfaces, slotted.surfaces, showSurfaces]);
  return (
    <div className="grid grid-cols-2 gap-6">
      <section aria-label="Свой чат" className="flex flex-col gap-2">
        {own.turns.map((turn) => (
          <div key={turn.id} data-testid="headless-turn" className="flex flex-col gap-1">
            <p className={`${bubble} self-end bg-brand/20`}>
              {turn.request.kind === "prompt" ? turn.request.text : `▶ ${turn.request.name}`}
            </p>
            {turn.result?.text ? (
              <p className={`${bubble} bg-white/[0.06]`}>{turn.result.text}</p>
            ) : null}
          </div>
        ))}
        {own.working === undefined ? null : (
          <p data-testid="headless-working" className="text-[12px] text-muted-foreground">
            Думаю…{" "}
            <button type="button" className={button} onClick={() => void own.cancel()}>
              Стоп
            </button>
          </p>
        )}
        {own.status === "error" ? (
          <p role="alert" data-testid="headless-error" className="text-[12px] text-destructive">
            Не получилось: {own.error?.title}{" "}
            <button type="button" className={button} onClick={() => void own.retry()}>
              Ещё раз
            </button>
          </p>
        ) : null}
        {own.surfaces.length === 0 ? null : (
          <A2UIKitProvider mode="scoped">
            {own.surfaces.map((surface) => (
              <A2UISurface key={surface.id} surface={surface} />
            ))}
          </A2UIKitProvider>
        )}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void own.send(text);
            setText("");
          }}
        >
          <input
            aria-label="Сообщение"
            className="flex-1 rounded border bg-transparent px-2 py-1 text-[13px]"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <button type="submit" className={button} disabled={own.status === "working"}>
            Спросить
          </button>
        </form>
      </section>
      <section aria-label="Чат со слотами">
        <A2UIChat
          chat={slotted}
          labels={{ input: "Сообщение в чат со слотами", send: "Послать" }}
          renderWorking={(_working, cancel) => (
            <p data-testid="slot-working">
              Слот: агент работает…{" "}
              <button type="button" onClick={cancel}>
                Прервать
              </button>
            </p>
          )}
          renderError={(problem, retry) => (
            <p role="alert" data-testid="slot-error">
              Слот ошибки: {problem?.title}{" "}
              <button type="button" onClick={retry}>
                Повторить запрос
              </button>
            </p>
          )}
          renderPlaceholder={() => <p data-testid="slot-placeholder">Слот: интерфейса не будет</p>}
          renderInvalid={(problem) => <p data-testid="slot-invalid">Слот: {problem?.title}</p>}
        />
      </section>
    </div>
  );
}
