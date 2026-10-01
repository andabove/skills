# Loggers

Checked against `effect 4.0.0`. Read `node_modules/effect/src/Logger.ts` and `References.ts` when a newer version is installed.

## What a logger receives

`Logger.make((options) => output)` receives one entry at a time:

| Field | Content |
| --- | --- |
| `message` | An array of the arguments given to `Effect.log*`, without any `Cause` arguments |
| `logLevel` | `"Trace"`, `"Debug"`, `"Info"`, `"Warn"`, `"Error"` or `"Fatal"` (typed as `LogLevel`, which also has `"All"` and `"None"`) |
| `cause` | The `Cause` arguments combined; `cause.reasons.length === 0` when there is none |
| `date` | When the entry was logged |
| `fiber` | The logging fiber: `fiber.id`, `fiber.getRef(References.CurrentLogAnnotations)`, `fiber.getRef(References.CurrentLogSpans)` (pairs of label and start time in milliseconds), `fiber.cache.span` (current span or `undefined`) |

Entries below `References.MinimumLogLevel` never reach a logger.

## Built-in loggers

Formatters return a value; console loggers print it.

| Formatter (returns) | Console logger (prints with `console.log`) | Output |
| --- | --- | --- |
| `Logger.formatSimple` (string) | | `timestamp=... level=INFO fiber=#1 message="order placed" orderId=o-1` |
| `Logger.formatLogFmt` (string) | `Logger.consoleLogFmt` | logfmt, compact |
| `Logger.formatStructured` (object) | `Logger.consoleStructured` | `{ message, level, timestamp, cause, annotations, spans, fiberId }` |
| `Logger.formatJson` (string) | `Logger.consoleJson` | the structured object as one JSON line |
| | `Logger.consolePretty({ colors, mode })` | colored, multi-line, for a terminal |
| | `Logger.defaultLogger` | `[12:00:00.000] INFO (#1) checkout=3ms: order placed { orderId: 'o-1' }` |
| | `Logger.tracerLogger` | no output; adds the entry as an event on the current span |

- Print a formatter elsewhere with `Logger.withConsoleLog(formatter)`, `Logger.withConsoleError(formatter)` (stderr) or `Logger.withLeveledConsole(formatter)` (`console.debug`, `console.info`, `console.warn`, `console.error` by level; `Trace` goes to `console.trace`, which prints a stack trace on stderr for each entry).
- Change a formatter's output with `Logger.map(logger, (output) => ...)`.
- `References.LogToStderr` set to `true` sends `defaultLogger` and `consolePretty` to stderr; the formatter-based console loggers (`consoleJson`, `consoleLogFmt`, `consoleStructured`) ignore it.
- The JSON and structured formats do not include trace ids. Add them yourself:

```ts
import * as Logger from "effect/Logger"

const jsonWithTrace = Logger.make((options) => {
  const span = options.fiber.cache.span
  globalThis.console.log(JSON.stringify({
    ...Logger.formatStructured.log(options),
    trace_id: span?.traceId,
    span_id: span?.spanId
  }))
})

export const LoggingLive = Logger.layer([jsonWithTrace, Logger.tracerLogger])
```

## Batching and files

```ts
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"

declare const ship: (records: ReadonlyArray<unknown>) => Effect.Effect<void>

// collect entries for one second, then send them in one call; the rest is flushed when the layer closes
export const ShippingLoggerLive = Logger.layer([
  Logger.batched(Logger.formatStructured, { window: "1 second", flush: ship }),
  Logger.tracerLogger
])

// append logfmt lines to a file
export const FileLoggerLive = Logger.layer([Logger.toFile(Logger.formatLogFmt, "app.log"), Logger.tracerLogger]).pipe(
  Layer.provide(NodeFileSystem.layer)
)
```

`Logger.batched` and `Logger.toFile` return an `Effect` of a logger that needs a `Scope`; `Logger.layer` provides it, so pending entries are written when the layer closes.

## Choosing a logger per environment

```ts
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as References from "effect/References"

export const LoggingLive = Layer.unwrap(
  Effect.gen(function*() {
    const env = yield* Config.String("NODE_ENV").pipe(Config.withDefault("development"))
    const level = yield* Config.LogLevel("LOG_LEVEL").pipe(Config.withDefault("Info" as const))
    const loggers = env === "production"
      ? Logger.layer([Logger.consoleJson, Logger.tracerLogger])
      : Logger.layer([Logger.consolePretty(), Logger.tracerLogger])
    return Layer.merge(loggers, Layer.succeed(References.MinimumLogLevel, level))
  })
)
```

## Levels per region

- `Effect.provideService(effect, References.MinimumLogLevel, "Debug")` turns debug logs on for one part of the program.
- `Effect.provideService(effect, References.CurrentLogLevel, "Warn")` changes the level that plain `Effect.log` uses inside.
- `Effect.logWithLevel(level)("message", ...)` logs at a level chosen at runtime.

## Testing logs

Capture entries with a logger and assert on the data, not the formatted line:

```ts
import * as Effect from "effect/Effect"
import * as Logger from "effect/Logger"
import * as References from "effect/References"

export const captureLogs = Effect.fnUntraced(function*<A, E, R>(effect: Effect.Effect<A, E, R>) {
  const entries: Array<{ level: string; message: ReadonlyArray<unknown>; annotations: Record<string, unknown> }> = []
  const capture = Logger.make((options) => {
    entries.push({
      level: options.logLevel,
      message: options.message as ReadonlyArray<unknown>,
      annotations: options.fiber.getRef(References.CurrentLogAnnotations)
    })
  })
  const result = yield* effect.pipe(Effect.provide(Logger.layer([capture])))
  return { result, entries }
})
```
