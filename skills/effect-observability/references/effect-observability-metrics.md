# Metrics

Checked against `effect 4.0.0`. Read `node_modules/effect/src/Metric.ts` and `node_modules/effect/src/observability/PrometheusMetrics.ts` when a newer version is installed.

## Constructors and state

Every constructor takes a name and an options object with an optional `description` and `attributes`.

| Constructor | Input | `Metric.value` state | Use for |
| --- | --- | --- | --- |
| `Metric.counter(name, { incremental?, bigint? })` | `number` (or `bigint`) | `{ count }` | Totals: requests, errors, bytes |
| `Metric.gauge(name, { bigint? })` | `number` | `{ value }` | A current level: queue depth, open connections |
| `Metric.histogram(name, { boundaries })` | `number` | `{ buckets, count, min, max, sum }` | Distributions you aggregate across instances |
| `Metric.timer(name, { boundaries? })` | `Duration` | as histogram, in milliseconds | Latency with `Effect.trackDuration` |
| `Metric.summary(name, { maxAge, maxSize, quantiles })` | `number` | `{ quantiles, count, min, max, sum }` | Quantiles over a sliding window, per instance |
| `Metric.frequency(name, { preregisteredWords? })` | `string` | `{ occurrences: Map<string, number> }` | Counts per value: status codes, error tags |

- Histogram buckets are cumulative: each `[boundary, count]` counts values less than or equal to the boundary.
- A hand-written `boundaries: [1, 5]` gets no `Infinity` bucket: values above 5 count in `count` but in no bucket. Wrap the list in `Metric.boundariesFromIterable([1, 5])`, which appends `Infinity`.
- `Metric.linearBoundaries({ start, width, count })` and `Metric.exponentialBoundaries({ start, factor, count })` build `count - 1` values, drop any value of 0 or less (as `boundariesFromIterable` does), and append `Infinity`: `linearBoundaries({ start: 0, width: 10, count: 3 })` is `[10, Infinity]`. `Metric.timer` without boundaries uses 35 exponential buckets from 0.5 ms and adds the attribute `time_unit: "milliseconds"`.
- A summary keeps up to `maxSize` samples younger than `maxAge` and computes the quantiles in the process. It cannot be merged across instances; prefer a histogram for anything you aggregate.

## Updating

| Call | Counter | Gauge | Histogram, timer, summary | Frequency |
| --- | --- | --- | --- | --- |
| `Metric.update(m, x)` | adds `x` | sets to `x` | records `x` | counts `x` |
| `Metric.modify(m, x)` | adds `x` | adds `x` | records `x` | counts `x` |

- `incremental: true` drops negative counter input; without it, a counter can go down.
- `Metric.withConstantInput(1)` turns a metric into one that ignores its input and always records `1`. Pair it with `Effect.trackSuccesses`, `trackErrors` or `trackDefects` to count outcomes.
- `Effect.trackSuccesses(m, f?)`, `trackErrors(m, f?)`, `trackDefects(m, f?)` feed the success value, the error or the defect, mapped by `f` when given. `Effect.trackDuration(m, f?)` feeds the run time as a `Duration`.
- `Effect.track(m, f?)` feeds the whole `Exit`.
- `Metric.mapInput(m, f)` adapts the input type.

```ts
import * as Effect from "effect/Effect"
import * as Metric from "effect/Metric"

const failuresByTag = Metric.frequency("checkout_failures")

declare const checkout: Effect.Effect<void, { readonly _tag: "CardDeclined" } | { readonly _tag: "OutOfStock" }>

// counts each failure under its tag
export const tracked = checkout.pipe(Effect.trackErrors(failuresByTag, (error) => error._tag))
```

## Attributes

- `Metric.withAttributes(m, { route: "/orders" })` returns the same metric with fixed attributes, which is a separate series.
- `Effect.provideService(effect, Metric.CurrentMetricAttributes, { region: "eu" })` adds attributes to every update inside `effect`.
- `Metric.value(m)` reads only the series for the attributes in scope at the read. Read with the same attributes you wrote with.
- Use attribute values from a small fixed set (route templates, status classes, tags). A user id or a raw URL per attribute makes a series per value and exhausts the backend.

## Registry, snapshots and tests

- Metrics live in `Metric.MetricRegistry`, a process-wide map keyed by name and attributes. Two `Metric.counter("x")` calls with the same name share one series.
- `yield* Metric.snapshot` lists every series; `yield* Metric.dump` returns a text table, useful in a debug endpoint.
- Give each test a fresh registry: `Effect.provideService(test, Metric.MetricRegistry, new Map())`.
- `Metric.enableRuntimeMetrics(effect)` or `Metric.enableRuntimeMetricsLayer` records `child_fibers_started`, `child_fibers_active`, `child_fiber_successes` and `child_fiber_failures`.

## Export

- OTLP: `OtlpMetrics.layer({ url, resource, exportInterval?, temporality? })` from `effect/observability`, or the combined `Otlp.layerJson` (see the export reference). `temporality` is `"cumulative"` (default) or `"delta"`.
- Prometheus: `PrometheusMetrics.layerHttp({ path?, prefix? })` adds `GET /metrics` (or `path`) to an `HttpRouter`. `yield* PrometheusMetrics.format({ prefix })` returns the exposition text for a route you serve yourself. Names are used as given: name counters `*_total` yourself if your dashboards expect it.
- Existing OpenTelemetry SDK: `@effect/opentelemetry` `OtelMetrics.layer` or `NodeSdk.layer({ metricReader })` reads Effect metrics into the SDK.
