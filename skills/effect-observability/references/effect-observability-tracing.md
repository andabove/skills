# Tracing details

Checked against `effect 4.0.0` and `@effect/opentelemetry 4.0.0`. Read `node_modules/effect/src/Tracer.ts` and the tracing section of `Effect.ts` when a newer version is installed.

## Span options

`Effect.withSpan(name, options)`, `Effect.fn(name, options)` and `Layer.withSpan(name, options)` take these options:

| Option | Effect |
| --- | --- |
| `attributes` | Key-value attributes set when the span starts |
| `kind` | `"internal"` (default), `"server"`, `"client"`, `"producer"`, `"consumer"` |
| `parent` | Use this span as the parent instead of the current one |
| `root: true` | Start a new trace, ignoring the current span |
| `links` | `[{ span, attributes }]`: connect to spans in other traces |
| `level` | The span's level for sampling (default `"Info"`, from `Tracer.CurrentTraceLevel`) |
| `sampled` | Force the sampling decision |

`Effect.withSpan` also accepts a function of the call arguments when it is a trailing argument of `Effect.fn`: `Effect.fn(body, Effect.withSpan("Users.find", (id: string) => ({ attributes: { "user.id": id } })))`.

## Reading and setting the current span

- `yield* Effect.currentSpan` returns the current `Span` (fails with `NoSuchElementError` outside a span). `span.traceId` and `span.spanId` are the ids to put in an error report or a response header.
- `Effect.annotateCurrentSpan(key, value)` or a record adds attributes to it.
- `Effect.annotateSpans(key, value)` or a record adds attributes to every span created inside an effect.
- `Effect.linkSpans(span, attributes?)` adds links to every span created inside an effect.
- `Effect.withParentSpan(span)` makes `span` the parent of the spans inside.
- In a `Logger`, `options.fiber.cache.span` is the current span, or `undefined`.

## Continuing a trace from outside

Turn trace ids received from a queue message, a job record or a header into a parent:

```ts
import { Effect, Tracer } from "effect"

declare const handleMessage: Effect.Effect<void>
declare const message: { readonly traceId: string; readonly spanId: string }

export const consume = handleMessage.pipe(
  Effect.withSpan("orders.consume", { kind: "consumer" }),
  Effect.withParentSpan(Tracer.externalSpan({ traceId: message.traceId, spanId: message.spanId }))
)
```

For a background job that should not extend the request's trace, start a new trace and link back:

```ts
import { Effect } from "effect"

declare const rebuildIndex: Effect.Effect<void>

export const enqueueRebuild = Effect.gen(function*() {
  const request = yield* Effect.currentSpan
  yield* Effect.forkDetach(
    rebuildIndex.pipe(Effect.withSpan("search.rebuild", { root: true, links: [{ span: request, attributes: {} }] }))
  )
})
```

## HTTP propagation

The `effect/http` `HttpClient` creates a `http.client <METHOD>` span for each request, with the URL, method and status as attributes, and sends `traceparent` and `b3` headers built from it. The server tracing middleware (`HttpMiddleware.tracer`) reads them into the parent of the `server` span it creates. See the `effect-services` skill for the platform modules.

## Sampling by level

A span whose `level` is below `Tracer.MinimumTraceLevel` (default `"All"`) is created with `sampled: false`, and so are its children.

```ts
import { Effect, Layer, Tracer } from "effect"

declare const parseRow: (row: string) => Effect.Effect<number>

export const parseAll = (rows: ReadonlyArray<string>) =>
  Effect.forEach(rows, (row) => parseRow(row).pipe(Effect.withSpan("csv.row", { level: "Debug" })))

// in production: drop the per-row spans
export const TraceLevelLive = Layer.succeed(Tracer.MinimumTraceLevel, "Info")
```

The `effect/observability` `OtlpTracer` skips unsampled spans. The `@effect/opentelemetry` tracer does not: the OpenTelemetry SDK's own sampler decides, and the Debug span above is still exported. With that SDK, configure sampling in the SDK, or use `Effect.fnUntraced` for the hot path.

## Cost and switches

- A span costs a clock read, an object and a few context updates. Keep spans to operations a reader of a trace waterfall wants to see: requests, service methods, queries, outgoing calls. Use `Effect.fnUntraced` inside tight loops.
- `References.TracerEnabled` set to `false` keeps spans away from the tracer; `Effect.currentSpan` then returns a no-op span.
- `References.TracerTimingEnabled` set to `false` skips the clock reads for span start and end times.
