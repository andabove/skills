---
name: effect-observability
description: Effect 4 logging, tracing and metrics, and their export. Use when adding Effect.log calls or log annotations, choosing or replacing a logger, routing Effect logs into an existing structured logger, adding spans with Effect.fn or Effect.withSpan, recording metrics, or exporting telemetry with the effect/observability OTLP modules or an existing OpenTelemetry SDK.
---

# Effect observability

Checked against `effect 4.0.0` and `@effect/opentelemetry 4.0.0`. When the project has a newer version, read `node_modules/effect/src/Logger.ts`, `Tracer.ts`, `Metric.ts`, `References.ts` and `node_modules/effect/src/observability/`, and `node_modules/effect/AGENTS.md`, before you trust a name here.

Import each module from its own subpath, as every example here does: `import * as Logger from "effect/Logger"`, `import * as Otlp from "effect/observability/Otlp"`, `import * as OtelTracer from "@effect/opentelemetry/OtelTracer"`.

Instrument with Effect APIs in every module. Choose where the telemetry goes once, at the entry point, with one layer. The signals share context: a log written inside a span becomes an event on that span, and a logger can read the current trace and span ids.

## Logging

```ts
import * as Effect from "effect/Effect"

declare const chargeCard: (orderId: string, cents: number) => Effect.Effect<string, "CardDeclined">

export const placeOrder = Effect.fn("Orders.place")(
  function*(orderId: string, cents: number) {
    yield* Effect.logDebug("pricing order")
    const receipt = yield* chargeCard(orderId, cents).pipe(
      Effect.tapError((error) => Effect.logWarning("charge refused").pipe(Effect.annotateLogs({ error })))
    )
    yield* Effect.logInfo("order placed").pipe(Effect.annotateLogs({ receipt, cents }))
    return receipt
  },
  // trailing arguments receive the effect and the call arguments
  (effect, orderId) => Effect.annotateLogs(effect, { orderId })
)
```

- Log with `Effect.logTrace`, `logDebug`, `logInfo` (same as `Effect.log`), `logWarning`, `logError`, `logFatal`. Use `console.log` only outside Effect code; it skips levels, annotations, spans and the configured logger.
- The minimum level is `"Info"`, so `logDebug` and `logTrace` print nothing by default. Set it once at the edge: `Layer.succeed(References.MinimumLogLevel, "Debug")`, or from config with `Config.LogLevel("LOG_LEVEL")` (values `"All"`, `"Trace"`, `"Debug"`, `"Info"`, `"Warn"`, `"Error"`, `"Fatal"`, `"None"`, case-sensitive). `"None"` silences all logs.
- Write a fixed event text as the only message, and put the variable data in `Effect.annotateLogs`. Extra arguments are kept as values in the message array, and a span event built from several arguments is named after their JSON.
- `Effect.annotateLogs(key, value)` or `Effect.annotateLogs({ ... })` reaches every log inside the effect, nested calls included. Annotate request id, tenant and user once at the boundary. `Effect.annotateLogsScoped({ ... })` annotates the rest of the current `Scope`.
- Pass a `Cause` as an argument to attach the failure: `Effect.catchCause((cause) => Effect.logError("import failed", cause))`. Loggers receive it as `cause`, not in the message.
- `Effect.withLogSpan("checkout")` adds `checkout=<ms>` to each log inside: a duration label, not a trace span.
- `Redacted` values print as `<redacted>` in every built-in logger.

## Loggers

A logger receives every entry at or above the minimum level. The default set holds `Logger.defaultLogger` (one human-readable line on stdout: `[12:00:00.000] INFO (#1) checkout=3ms: order placed { orderId: 'o-1' }`) and `Logger.tracerLogger` (adds each log as an event on the current span).

| Need | Layer |
| --- | --- |
| JSON lines for a log pipeline | `Logger.layer([Logger.consoleJson, Logger.tracerLogger])` |
| Colors for local development | `Logger.layer([Logger.consolePretty(), Logger.tracerLogger])` |
| logfmt | `Logger.layer([Logger.consoleLogFmt, Logger.tracerLogger])` |
| Add a logger, keep the current ones | `Logger.layer([myLogger], { mergeWithExisting: true })` |
| JSON lines on stderr | `Logger.layer([Logger.withConsoleError(Logger.formatJson), Logger.tracerLogger])` (`References.LogToStderr` moves only `defaultLogger` and `consolePretty`) |

- `Logger.layer([...])` replaces the whole set. Keep `Logger.tracerLogger` in the list, or logs stop appearing as span events.
- Provide one logger layer at the entry point. A second `Logger.layer` deeper in the program replaces the first for that part only.
- Never put two layers that set loggers (`Logger.layer`, the OTLP logger in `Otlp.layer*`, `OtelLogger.layer`) side by side in `Layer.mergeAll`. Each builds its set from the loggers current when it is built, so one silently drops the other. Nest them instead: `ObservabilityLive.pipe(Layer.provideMerge(LoggingLive))` keeps both.
- In tests, capture entries with `Logger.make` (see [the loggers reference](references/effect-observability-loggers.md)).

## A project with a structured logger already

When the project already ships a logger such as pino or winston, with its transports, redaction and log shipping, keep it as the one sink. Replace Effect's default logger with a bridge that maps level, message, annotations, log spans, cause and trace ids onto the project logger's fields:

```ts
import * as Cause from "effect/Cause"
import * as Logger from "effect/Logger"
import type * as LogLevel from "effect/LogLevel"
import * as Predicate from "effect/Predicate"
import * as References from "effect/References"

type LogFn = (fields: Record<string, unknown>, message: string) => void
// the project's existing logger, pino-style: logger.info(fields, message)
declare const appLogger: Record<"trace" | "debug" | "info" | "warn" | "error" | "fatal", LogFn>

const methods: Record<LogLevel.LogLevel, keyof typeof appLogger> = {
  All: "trace", Trace: "trace", Debug: "debug", Info: "info", Warn: "warn", Error: "error", Fatal: "fatal", None: "info"
}

const appLoggerBridge = Logger.make(({ cause, date, fiber, logLevel, message }) => {
  const parts: Array<unknown> = Array.isArray(message) ? [...message] : [message]
  const text = typeof parts[0] === "string" ? String(parts.shift()) : ""
  const fields: Record<string, unknown> = { ...fiber.getRef(References.CurrentLogAnnotations) }
  const args: Array<unknown> = []
  for (const value of parts) {
    if (value instanceof Error) fields["err"] = value
    else if (Predicate.isObject(value)) Object.assign(fields, value)
    else args.push(value)
  }
  if (args.length > 0) fields["args"] = args
  for (const [label, start] of fiber.getRef(References.CurrentLogSpans)) fields[`${label}_ms`] = date.getTime() - start
  const span = fiber.cache.span
  if (span !== undefined) Object.assign(fields, { trace_id: span.traceId, span_id: span.spanId })
  if (cause.reasons.length > 0) fields["err"] = Cause.squash(cause)
  appLogger[methods[logLevel]](fields, text)
})

export const LoggingLive = Logger.layer([appLoggerBridge, Logger.tracerLogger])
```

- Combine it with an OTLP or OpenTelemetry logger by nesting, not `Layer.mergeAll` (see [Loggers](#loggers)).
- Both sides filter by level. Set `References.MinimumLogLevel` to match the project logger's level, or `logDebug` calls are dropped before they reach it.
- Non-Effect code keeps calling the project logger directly. Effect code calls `Effect.log*` only, so annotations and spans apply.
- When the codebase is mostly Effect and has no logger to keep, skip the bridge and use `Logger.consoleJson`.

## Tracing

```ts
import * as Effect from "effect/Effect"

declare const insertOrder: (orderId: string) => Effect.Effect<void>

export const createOrder = Effect.fn("Orders.create", { attributes: { "order.source": "web" } })(
  function*(orderId: string, lines: number) {
    yield* Effect.annotateCurrentSpan({ "order.id": orderId, "order.lines": lines })
    yield* insertOrder(orderId).pipe(Effect.withSpan("Orders.insert", { kind: "client" }))
  }
)

export const handleRequest = createOrder("o-1", 3).pipe(
  Effect.withSpan("POST /orders", { kind: "server", attributes: { "http.route": "/orders" } })
)
```

- Write every service method and exported effectful function as `Effect.fn("Service.method")(function*() { ... })`. The name becomes the span name and a stack frame. Name it after the function.
- `Effect.fn(body)` without a name and `Effect.fnUntraced(body)` create no span. Use `fnUntraced` for hot paths and library internals.
- Wrap an inline block or a handler with `Effect.withSpan(name, { attributes, kind })`. `kind` is `"server"`, `"client"`, `"producer"`, `"consumer"` or `"internal"` (default).
- Add attributes inside with `Effect.annotateCurrentSpan(key, value)` or a record. `Effect.annotateSpans(...)` puts attributes on every span inside an effect.
- Spans nest by call. A failure sets the span status to error and records an exception event. An interruption ends the span with status OK and the attribute `status.interrupted: true`.
- `Layer.withSpan("name")` traces a layer's construction.
- Without an exporter layer, spans are created in memory and dropped. With `Layer.succeed(References.TracerEnabled, false)`, no span reaches the tracer; `Effect.currentSpan` still returns a no-op span.

Parents, links, sampling and propagation are in [the tracing reference](references/effect-observability-tracing.md).

## Metrics

```ts
import * as Effect from "effect/Effect"
import * as Metric from "effect/Metric"

// define once, at module level: metrics are global, keyed by name and attributes
const ordersPlaced = Metric.counter("orders_placed_total", { incremental: true }).pipe(Metric.withConstantInput(1))
const orderFailures = Metric.counter("orders_failed_total", { incremental: true }).pipe(Metric.withConstantInput(1))
const checkoutLatency = Metric.timer("checkout_duration")
const queueDepth = Metric.gauge("checkout_queue_depth")

declare const checkout: Effect.Effect<string, "PaymentFailed">

export const instrumentedCheckout = checkout.pipe(
  Effect.trackSuccesses(ordersPlaced),
  Effect.trackErrors(orderFailures),
  Effect.trackDuration(checkoutLatency),
  Effect.tap(() => Metric.update(queueDepth, 7))
)
```

- `Metric.update(metric, input)`: a counter adds, a gauge replaces, a histogram, summary or timer records, a frequency counts the string. `Metric.modify` adds to a gauge.
- `incremental: true` makes a counter ignore negative input. Use it for anything exported as a Prometheus counter.
- `Effect.trackSuccesses(metric)` feeds the success value; with `Metric.withConstantInput(1)` it counts. `trackErrors` and `trackDefects` do the same for failures and defects. `trackDuration` feeds the run time to a timer.
- `Metric.withAttributes(metric, { route })` makes a separate series. `Effect.provideService(Metric.CurrentMetricAttributes, { ... })` adds attributes to every metric update inside an effect. Keep attribute values to a small, fixed set: an id per user or request makes one series each.
- `Metric.value(metric)` reads the series for the current attributes. In tests, give each test a fresh registry: `Effect.provideService(Metric.MetricRegistry, new Map())`.
- Metrics stay in the process until an export layer reads them.

Constructors, states and Prometheus are in [the metrics reference](references/effect-observability-metrics.md).

## Export

| Situation | Use |
| --- | --- |
| New service, OTLP collector or vendor endpoint | `Otlp.layerJson({ baseUrl, resource })` from `effect/observability`, with an `HttpClient` layer |
| Endpoint and service name come from `OTEL_*` variables | `Otlp.layerFromConfig()`, with `OtlpSerialization.layerJson` and an `HttpClient` layer |
| The process already starts an OpenTelemetry SDK | `@effect/opentelemetry`: `OtelTracer.layerGlobal` with `Resource.layer` |
| Effect starts the SDK, with OpenTelemetry processors and exporters | `@effect/opentelemetry`: `NodeSdk.layer(() => ({ resource, spanProcessor, ... }))` |
| Prometheus scrape | `PrometheusMetrics.layerHttp()` on an `HttpRouter`, or `PrometheusMetrics.format()` |

```ts
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Otlp from "effect/observability/Otlp"

export const ObservabilityLive = Otlp.layerJson({
  baseUrl: "http://localhost:4318", // sends to /v1/traces, /v1/logs and /v1/metrics
  resource: { serviceName: "orders-api", serviceVersion: "1.4.0" }
}).pipe(Layer.provide(FetchHttpClient.layer))

declare const main: Effect.Effect<void>

main.pipe(Effect.provide(ObservabilityLive), NodeRuntime.runMain)
```

- Provide the export layer outermost, so every span is inside it. The exporters batch in the background and flush when the layer's scope closes.
- Give a service name in `resource` or `OTEL_SERVICE_NAME`. Without one, building the OTLP layer dies with a `ConfigError` for `OTEL_SERVICE_NAME`.
- `Otlp.layerFromConfig()` exports a signal only when `OTEL_TRACES_EXPORTER`, `OTEL_LOGS_EXPORTER` or `OTEL_METRICS_EXPORTER` contains `otlp`. With only `OTEL_EXPORTER_OTLP_ENDPOINT` set, it exports nothing and reports nothing.
- The OTLP logger adds itself to the loggers current when it is built, so console output continues. Pass `loggerMergeWithExisting: false` to export logs only. To keep a custom logger as well, build it first: `ObservabilityLive.pipe(Layer.provideMerge(LoggingLive))`.
- With an existing OpenTelemetry SDK, an Effect span started with no Effect parent does not join the active OpenTelemetry span. Pass the parent at the boundary with `OtelTracer.withSpanContext`, and set the service name in that SDK. The setup and the full example are in [the export reference](references/effect-observability-export.md).
