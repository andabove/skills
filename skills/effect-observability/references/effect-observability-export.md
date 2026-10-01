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
import * as Layer from "effect/Layer"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Otlp from "effect/observability/Otlp"
import * as OtlpSerialization from "effect/observability/OtlpSerialization"

// OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318 OTEL_SERVICE_NAME=orders-api
// OTEL_TRACES_EXPORTER=otlp OTEL_LOGS_EXPORTER=otlp OTEL_METRICS_EXPORTER=otlp
export const ObservabilityLive = Otlp.layerFromConfig().pipe(
  Layer.provide(OtlpSerialization.layerJson),
  Layer.provide(FetchHttpClient.layer)
)
```

### Delivery

- The exporters buffer in memory and post in the background. They retry a failed post up to 3 times (a `429` waits for `Retry-After`), then drop that batch and disable the exporter, with only a `Debug` log. While disabled, the exporter drops every new record. It re-enables only when an export runs (the next `exportInterval` tick, or an explicit flush) at least 60 seconds after the failure; time passing alone does not re-enable it. The program is not affected: a run with the collector down still succeeds.
- When the layer's scope closes, the exporters flush, waiting up to `shutdownTimeout`. With the collector down, process exit waits that long; lower it for CLIs.
- A process that never closes the layer (a serverless function with a long-lived `ManagedRuntime`) must flush in each invocation. The per-signal layers provide `OtlpExporter.Flusher`. Flush at the start as well as the end: after a collector outage, a start flush re-enables the exporter before the invocation records anything, where an end-only flush comes too late and the invocation's telemetry is dropped. (Tested with a long `exportInterval` and a real 61-second wait; a real serverless freeze was not tested.)

```ts
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as OtlpExporter from "effect/observability/OtlpExporter"
import * as OtlpSerialization from "effect/observability/OtlpSerialization"
import * as OtlpTracer from "effect/observability/OtlpTracer"

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
  runtime.runPromise(
    flush.pipe(
      Effect.andThen(work(event).pipe(Effect.withSpan("thumbnailer.invoke"))),
      Effect.ensuring(flush)
    )
  )
```

## `@effect/opentelemetry`: when an OpenTelemetry SDK runs already

Install `@effect/opentelemetry` at the same version as `effect`. Its OpenTelemetry dependencies are optional peers, so install the ones the modules you import load at runtime (checked with `@effect/opentelemetry@4.0.0`, `@opentelemetry/api` 1.9, SDK 2.x, logs 0.222):

| Module you import | Peers it loads |
| --- | --- |
| `@effect/opentelemetry/OtelTracer`, `/Resource` | `@opentelemetry/api`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions` |
| `@effect/opentelemetry/OtelLogger` | the above, plus `@opentelemetry/api-logs`, `@opentelemetry/sdk-logs` |
| `@effect/opentelemetry/OtelMetrics` | the above tracer peers, plus `@opentelemetry/sdk-metrics` |
| `@effect/opentelemetry/NodeSdk` | all of the above, plus `@opentelemetry/sdk-trace-node`, even when you only trace |

Import these module subpaths. The package index `@effect/opentelemetry` also loads `WebSdk`, so in a Node install without `@opentelemetry/sdk-trace-web` it fails with `ERR_MODULE_NOT_FOUND`.

Keep one SDK per process: let the existing one own providers, processors, exporters, auto-instrumentation and the service resource, and connect Effect to it.

### Traces

```ts
import * as OtelTracer from "@effect/opentelemetry/OtelTracer"
import * as Resource from "@effect/opentelemetry/Resource"
import * as Otel from "@opentelemetry/api"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"

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

```ts
import * as OtelLogger from "@effect/opentelemetry/OtelLogger"
import type { LoggerProvider } from "@opentelemetry/sdk-logs"
import * as Layer from "effect/Layer"

declare const loggerProvider: LoggerProvider // exported by the module that starts the SDK

export const EffectLogsLive = OtelLogger.layer({ mergeWithExisting: false }).pipe(
  Layer.provide(Layer.succeed(OtelLogger.OtelLoggerProvider, loggerProvider))
)
```

- Metrics: `OtelMetrics.layer(() => reader)` needs a `MetricReader` of its own. A reader already registered with the SDK's `MeterProvider` makes the layer die with "MetricReader can not be bound to a MeterProvider again". Create a second reader and exporter for Effect metrics, or export Effect metrics with `OtlpMetrics.layer` from `effect/observability`.

## `@effect/opentelemetry`: when Effect starts the SDK

When there is no SDK yet but you want OpenTelemetry processors, exporters or vendor span processors, let Effect build it:

```ts
import * as NodeSdk from "@effect/opentelemetry/NodeSdk"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { BatchLogRecordProcessor, type LogRecordExporter } from "@opentelemetry/sdk-logs"
import { PeriodicExportingMetricReader, type PushMetricExporter } from "@opentelemetry/sdk-metrics"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"

// for example OTLPLogExporter and OTLPMetricExporter from the OTLP exporter packages
declare const logExporter: LogRecordExporter
declare const metricExporter: PushMetricExporter

export const TelemetryLive = NodeSdk.layer(() => ({
  resource: { serviceName: "orders-api", serviceVersion: "1.4.0" },
  spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter()),
  metricReader: new PeriodicExportingMetricReader({ exporter: metricExporter }),
  // sdk-logs 0.2xx takes an options object; a bare exporter fails at shutdown
  logRecordProcessor: new BatchLogRecordProcessor({ exporter: logExporter }),
  shutdownTimeout: "3 seconds"
}))
```

- `NodeSdk.layer` enables only the signals you pass a processor or reader for, and shuts the providers down when the layer closes. It does not register a global provider, so libraries instrumented with plain OpenTelemetry do not see it. Use the previous section when auto-instrumentation must share the trace.
- Use `WebSdk.layer` in the browser.
- For a new service with no need for OpenTelemetry processors, the `effect/observability` modules do the same with fewer dependencies.
