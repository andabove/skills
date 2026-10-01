# Exporting telemetry

Checked against `effect 4.0.0` and `@effect/opentelemetry 4.0.0`. Read `node_modules/effect/src/observability/` and `node_modules/@effect/opentelemetry/src/` when a newer version is installed.

## The `effect/observability` OTLP modules

These modules ship in the `effect` package and speak OTLP over HTTP themselves. No OpenTelemetry SDK package is needed. Use them in a new service, or in any service that has no OpenTelemetry SDK yet.

| Module | Layer | Provides |
| --- | --- | --- |
| `Otlp` | `layer`, `layerJson`, `layerProtobuf`, `layerFromConfig` | Traces, logs and metrics from one `baseUrl` (`/v1/traces`, `/v1/logs`, `/v1/metrics`) |
| `OtlpTracer` | `layer({ url, ... })`, `layerFromConfig()` | The Effect `Tracer`, plus `OtlpExporter.Flusher` |
| `OtlpLogger` | `layer({ url, ... })`, `layerFromConfig()` | A logger added to the set current when the layer is built, plus `Flusher` |
| `OtlpMetrics` | `layer({ url, ... })`, `layerFromConfig()` | A periodic metrics export, plus `Flusher` |
| `OtlpSerialization` | `layerJson`, `layerProtobuf` | The wire format; `Otlp.layerJson` and `Otlp.layerProtobuf` include it |
| `PrometheusMetrics` | `layerHttp`, `format` | A scrape endpoint instead of push |

Every OTLP layer also needs an `HttpClient`: `FetchHttpClient.layer` from `effect/http`, or `NodeHttpClient.layerUndici` from `@effect/platform-node`.

### Options

| Option | Default | Effect |
| --- | --- | --- |
| `resource.serviceName` | `OTEL_SERVICE_NAME` | Required one way or the other; the layer build dies without it |
| `resource.serviceVersion`, `resource.attributes` | `OTEL_SERVICE_VERSION`, `OTEL_RESOURCE_ATTRIBUTES` | Resource attributes on every record |
| `headers` | none | Sent with each export, for example a vendor API key |
| `exportInterval` | traces 5 s, logs 1 s, metrics 10 s | How often buffered data is posted (`tracerExportInterval`, `loggerExportInterval`, `metricsExportInterval` in `Otlp.layer`) |
| `maxBatchSize` | 1000 | Records per request |
| `shutdownTimeout` | 3 s | How long the final flush may take when the layer closes |
| `mergeWithExisting` (logger) | `true` | Keep the current loggers next to the OTLP logger (`loggerMergeWithExisting` in `Otlp.layer`) |
| `excludeLogSpans` (logger) | `false` | Leave `Effect.withLogSpan` labels out of log attributes |
| `temporality` (metrics) | `"cumulative"` | Or `"delta"`, as the backend requires |

### Configuration from the environment

`Otlp.layerFromConfig()` and the per-signal `layerFromConfig()` read the standard variables through `Config`:

- `OTEL_EXPORTER_OTLP_ENDPOINT` (the path `/v1/<signal>` is appended) or `OTEL_EXPORTER_OTLP_<SIGNAL>_ENDPOINT` (used as is),
- `OTEL_TRACES_EXPORTER`, `OTEL_LOGS_EXPORTER`, `OTEL_METRICS_EXPORTER`: the signal is exported only when the list contains `otlp`. The OpenTelemetry SDKs default these to `otlp`; Effect 4.0.0 defaults them to empty, so set them,
- `OTEL_SDK_DISABLED=true` turns all export off,
- `OTEL_EXPORTER_OTLP_HEADERS` or `OTEL_EXPORTER_OTLP_<SIGNAL>_HEADERS`, `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`, and the batch timings `OTEL_BSP_*`, `OTEL_BLRP_*`, `OTEL_METRIC_EXPORT_INTERVAL`.

```ts
import { Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { Otlp, OtlpSerialization } from "effect/observability"

// OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318 OTEL_SERVICE_NAME=orders-api
// OTEL_TRACES_EXPORTER=otlp OTEL_LOGS_EXPORTER=otlp OTEL_METRICS_EXPORTER=otlp
export const ObservabilityLive = Otlp.layerFromConfig().pipe(
  Layer.provide(OtlpSerialization.layerJson),
  Layer.provide(FetchHttpClient.layer)
)
```

### Delivery

- The exporters buffer in memory and post in the background. They retry a failed post up to 3 times (a `429` waits for `Retry-After`), then drop that batch and stop exporting for 60 seconds, with only a `Debug` log. The program is not affected: a run with the collector down still succeeds.
- When the layer's scope closes, the exporters flush, waiting up to `shutdownTimeout`. With the collector down, process exit waits that long; lower it for CLIs.
- A process that never closes the layer (a serverless function with a long-lived `ManagedRuntime`) must flush at the end of each invocation. The per-signal layers provide `OtlpExporter.Flusher`:

```ts
import { Effect, Layer, ManagedRuntime } from "effect"
import { FetchHttpClient } from "effect/http"
import { OtlpExporter, OtlpSerialization, OtlpTracer } from "effect/observability"

const TracingLive = OtlpTracer.layer({
  url: "https://collector.example.com/v1/traces",
  resource: { serviceName: "thumbnailer" }
}).pipe(Layer.provide(OtlpSerialization.layerJson), Layer.provide(FetchHttpClient.layer))

const runtime = ManagedRuntime.make(TracingLive)

const flush = Effect.gen(function*() {
  const flusher = yield* OtlpExporter.Flusher
  yield* flusher.flush.pipe(Effect.timeoutOption("2 seconds"))
})

declare const work: (event: unknown) => Effect.Effect<string>

export const handler = (event: unknown) =>
  runtime.runPromise(work(event).pipe(Effect.withSpan("thumbnailer.invoke"), Effect.ensuring(flush)))
```

## `@effect/opentelemetry`: when an OpenTelemetry SDK runs already

Install `@effect/opentelemetry` at the same version as `effect`, and the OpenTelemetry packages the project already uses (`@opentelemetry/api` 1.x, SDK 2.x, logs and experimental packages 0.2xx; they are optional peers). Keep one SDK per process: let the existing one own providers, processors, exporters, auto-instrumentation and the service resource, and connect Effect to it.

### Traces

```ts nocheck
import { OtelTracer, Resource } from "@effect/opentelemetry"
import * as Otel from "@opentelemetry/api"
import { Effect, Layer, ManagedRuntime } from "effect"

// The SDK (for example NodeSDK from @opentelemetry/sdk-node) is started in the
// instrumentation file, before this module loads. Effect reuses its global provider.
export const EffectTracingLive = OtelTracer.layerGlobal.pipe(
  Layer.provide(Resource.layer({ serviceName: "orders-api" }))
)

export const runtime = ManagedRuntime.make(EffectTracingLive)

// Call at the start of a request handler, while the framework's span is active
export const underActiveSpan = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const active = Otel.trace.getActiveSpan()
  return active === undefined ? effect : OtelTracer.withSpanContext(effect, active.spanContext())
}

declare const createOrder: (body: unknown) => Effect.Effect<string>

// app.post("/orders", async (req, res) => res.send(await runtime.runPromise(createOrder(req.body).pipe(underActiveSpan))))
```

- Effect spans become OpenTelemetry spans, and Effect makes its current span the active OpenTelemetry context while it runs: a `pg` or `http` call instrumented by the SDK becomes a child of the Effect span.
- The other direction is not automatic. An Effect span with no Effect parent starts a new trace, even inside an active OpenTelemetry span. `underActiveSpan` above passes the active span as the parent. Call it in the handler, where the framework's span is active, not inside the Effect program.
- `service.name` and the other resource attributes come from the SDK's resource. `Resource.layer` here only names the Effect tracer; set the service name in the SDK.
- `Tracer.MinimumTraceLevel` has no effect here: the SDK's sampler decides.

### Logs and metrics

- Logs: give Effect the SDK's `LoggerProvider` instance (from `@opentelemetry/sdk-logs`), then add `OtelLogger.layer`:

```ts nocheck
import { OtelLogger } from "@effect/opentelemetry"
import type { LoggerProvider } from "@opentelemetry/sdk-logs"
import { Layer } from "effect"

declare const loggerProvider: LoggerProvider // exported by the module that starts the SDK

export const EffectLogsLive = OtelLogger.layer({ mergeWithExisting: false }).pipe(
  Layer.provide(Layer.succeed(OtelLogger.OtelLoggerProvider, loggerProvider))
)
```

- Metrics: `OtelMetrics.layer(() => reader)` needs a `MetricReader` of its own. A reader already registered with the SDK's `MeterProvider` makes the layer die with "MetricReader can not be bound to a MeterProvider again". Create a second reader and exporter for Effect metrics, or export Effect metrics with `OtlpMetrics.layer` from `effect/observability`.

## `@effect/opentelemetry`: when Effect starts the SDK

When there is no SDK yet but you want OpenTelemetry processors, exporters or vendor span processors, let Effect build it:

```ts nocheck
import { NodeSdk } from "@effect/opentelemetry"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"

export const TracingLive = NodeSdk.layer(() => ({
  resource: { serviceName: "orders-api", serviceVersion: "1.4.0" },
  spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter()),
  // metricReader: new PeriodicExportingMetricReader({ exporter }),
  // logRecordProcessor: new BatchLogRecordProcessor(logExporter),
  shutdownTimeout: "3 seconds"
}))
```

- `NodeSdk.layer` enables only the signals you pass a processor or reader for, and shuts the providers down when the layer closes. It does not register a global provider, so libraries instrumented with plain OpenTelemetry do not see it. Use the previous section when auto-instrumentation must share the trace.
- Use `WebSdk.layer` in the browser.
- For a new service with no need for OpenTelemetry processors, the `effect/observability` modules do the same with fewer dependencies.
