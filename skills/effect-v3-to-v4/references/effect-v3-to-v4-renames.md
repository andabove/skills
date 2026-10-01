# Effect 3 to 4.0.0 renames

Checked against `effect` 4.0.0. `migration/v3-to-v4.md` at `effect@4.0.0` names 3,496 v4 targets for the core `effect` package and the `@effect/platform` modules that moved into it. 3,465 resolve to a 4.0.0 export and 10 to a JavaScript built-in such as `Object.entries`; 15 name no export and 6 are placeholders. Use the reference for any name that is not here, and check the target in the source. The ones that do not resolve are in `effect-v3-to-v4-errata.md`.

## Patterns: guess, then verify

v4 renamed whole families the same way. Use a pattern to find the candidate, then confirm it in `node_modules/effect/src/<Module>.ts`:

| v3 pattern | v4 pattern | Examples |
| --- | --- | --- |
| `unsafeX` | `xUnsafe` (55 of 65 renames) | `Ref.unsafeMake` to `Ref.makeUnsafe`, `Context.unsafeGet` to `Context.getUnsafe`, `Deferred.unsafeDone` to `Deferred.doneUnsafe` |
| `XNullable` | `XNullishOr` | `Option.fromNullable` to `Option.fromNullishOr`, `Effect.fromNullable` to `Effect.fromNullishOr`; but `Predicate.isNullable` to `Predicate.isNullish` |
| `XException` | `XError` | `Cause.TimeoutException` to `Cause.TimeoutError` |
| `getEquivalence`, `getOrder` | `makeEquivalence`, `makeOrder` | `Array.getOrder` to `Array.makeOrder` |
| `catchAll`, `catchAllCause` | `catch`, `catchCause` | also on `Layer`, `Channel`, `Stream`, `HttpClient` |
| `Either` vocabulary: `Left`, `Right`, `left`, `right`, `getLeft`, `getRight` | `Result` vocabulary: `Failure`, `Success`, `fail`, `succeed`, `getFailure`, `getSuccess` | `Option.getRight` to `Option.getSuccess` |
| `XTypeId` exported for a guard | `isX` | `Fiber.FiberTypeId` to `Fiber.isFiber`, `Queue.DequeueTypeId` to `Queue.isDequeue` |
| `scoped` variants of layer constructors | the plain names, which accept a `Scope` requirement | `Layer.scoped` to `Layer.effect`, `Layer.unwrapScoped` to `Layer.unwrap` |
| lowercase `Config` constructors | PascalCase, like schemas | `Config.string` to `Config.String`, `Config.integer` to `Config.Int`, `Config.secret` to `Config.Redacted` |

## By module

Each pair below is the reference's target, and each target exists in 4.0.0. Where the target is a different kind of API (a combinator for a constructor), read the reference line for the new shape.

- **Context**: `Context.Tag` to `Context.Service`; `Context.isTag` to `Context.isKey`; `Context.TagTypeId` to `Context.ServiceTypeId`.
- **Layer**: `Layer.catchAll` to `Layer.catch`; `Layer.catchAllCause` to `Layer.catchCause`; `Layer.scoped` to `Layer.effect`; `Layer.scopedContext` to `Layer.effectContext`; `Layer.scopedDiscard` to `Layer.effectDiscard`; `Layer.tapErrorCause` to `Layer.tapCause`; `Layer.unwrapEffect` and `Layer.unwrapScoped` to `Layer.unwrap`; `Layer.ensureErrorType`, `ensureRequirementsType`, `ensureSuccessType` to `Layer.satisfiesErrorType`, `satisfiesServicesType`, `satisfiesSuccessType`.
- **Runtime**: `Runtime.Runtime` to `Context.Context`; `Runtime.runFork`, `runPromise`, `runPromiseExit`, `runSync`, `runSyncExit`, `runCallback` to `Effect.runForkWith`, `runPromiseWith`, `runPromiseExitWith`, `runSyncWith`, `runSyncExitWith`, `runCallbackWith`; `Runtime.AsyncFiberException` to `Cause.AsyncFiberError`; `Runtime.RunForkOptions` to `Effect.RunOptions`.
- **FiberRef**: `FiberRef.currentLogLevel`, `currentMinimumLogLevel`, `currentLogAnnotations`, `currentLogSpan`, `currentLoggers`, `currentTracerEnabled`, `unhandledErrorLogLevel` to `References.CurrentLogLevel`, `MinimumLogLevel`, `CurrentLogAnnotations`, `CurrentLogSpans`, `CurrentLoggers`, `TracerEnabled`, `UnhandledLogLevel`; `FiberRef.make` to `Context.Reference`; `Effect.locally` to `Effect.provideService`; `FiberRef.set`, `reset` and `delete` are not renames (see **Recipes**); `FiberRef.currentContext` to `Effect.context`; `FiberRef.currentMetricLabels` to `Metric.CurrentMetricAttributes`.
- **Exit**: `Exit.causeOption` to `Exit.getCause`; `Exit.isInterrupted` to `Exit.hasInterrupts`; `Exit.as` to `Exit.map`.
- **Fiber**: `Fiber.RuntimeFiber` to `Fiber.Fiber`; `Fiber.all` to `Fiber.joinAll`; `Fiber.getCurrentFiber` to `Fiber.getCurrent`; `Fiber.scoped` to `Fiber.runIn`.
- **Scope**: `Scope.extend` to `Scope.provide`; `Scope.CloseableScope` to `Scope.Closeable`.
- **Schedule**: `Schedule.union` and `either` to `Schedule.min`; `Schedule.intersect` to `Schedule.max`; `Schedule.andThen` to `Schedule.concat`; `Schedule.check` to `Schedule.while`; `Schedule.delayed` to `Schedule.modifyDelay`; `Schedule.fromDelay` to `Schedule.duration`; `Schedule.repeatForever` and `count` to `Schedule.forever`; `Schedule.dayOfWeek`, `hourOfDay` and the other calendar schedules to `Schedule.cron`.
- **Option**: `Option.fromNullable` to `Option.fromNullishOr`; `Option.liftNullable` to `Option.liftNullishOr`; `Option.getLeft`, `getRight` to `Option.getFailure`, `getSuccess`; `Option.orElseEither` to `Option.orElseResult`.
- **Logger**: `Logger.jsonLogger` to `Logger.formatJson`; `Logger.logfmtLogger` to `Logger.formatLogFmt`; `Logger.prettyLogger` to `Logger.consolePretty`; `Logger.structuredLogger` to `Logger.formatStructured`; `Logger.replace` to `Logger.layer`.
- **Config and ConfigProvider**: `Config.string`, `number`, `integer`, `boolean`, `date`, `duration`, `url`, `port`, `redacted`, `secret`, `logLevel` to `Config.String`, `Number`, `Int`, `Boolean`, `Date`, `Duration`, `URL`, `Port`, `Redacted`, `Redacted`, `LogLevel`; `Config.mapAttempt` and `mapOrFail` to `Config.mapEffect`; `ConfigProvider.fromJson` to `ConfigProvider.fromUnknown`; `ConfigProvider.fromMap` has no direct target: `fromUnknown` fails with a `ConfigError` on a `Map`, so expand its delimited keys into a nested object first (see **Recipes**); `ConfigProvider.fromFlat` to `ConfigProvider.make`.
- **Duration**: `Duration.DurationInput` to `Duration.Input`; `Duration.decode` to `Duration.fromInputUnsafe`; `Duration.lessThan`, `greaterThan` and the other comparisons to `Duration.isLessThan`, `isGreaterThan`, ...
- **Queue and Deferred**: `Queue.awaitShutdown` to `Queue.await`, which ends with an interruption after `Queue.shutdown` where v3 succeeded; `Queue.takeUpTo` has no single replacement (see **Recipes**); unchanged `Queue.takeAll` now waits on an empty queue, so use `Queue.clear` for a non-blocking drain; `Deferred.unsafeMake` to `Deferred.makeUnsafe`.
- **Data**: `Data.Structural` to `Data.Class`; `Data.struct`, `tuple`, `array` and `case` are removed (v4 `Equal.equals` compares plain values by structure).
- **Schema**: the Schema API changed widely. Read `migration/schema.md` in the checkout, by heading, and check each name in `Schema.ts`. `Schema.TaggedError` keeps its v3 name; the beta name `Schema.TaggedErrorClass` does not exist in 4.0.0.
- **Platform modules**: `@effect/platform/FileSystem`, `Path` and `Terminal` to `effect/FileSystem`, `effect/Path` and `effect/Terminal`; `@effect/platform/Error` to `effect/PlatformError`; `@effect/platform/HttpClient` and the other `Http*` modules to `effect/http/*`; `@effect/platform/Command` to `effect/process/ChildProcess`; `@effect/platform/Runtime` (`makeRunMain`, `defaultTeardown`, `Teardown`) to `effect/Runtime`. Search the Import Map for the rest.

## v3 names the reference misses

These v3 exports are absent from 4.0.0 and have no entry in the reference. The candidate is the 4.0.0 export that does the same job; confirm its signature before you use it.

| v3 | Candidate in 4.0.0 |
| --- | --- |
| `Effect.Semaphore` (type) | `Semaphore.Semaphore` |
| `Effect.Latch` (type) | `Latch.Latch` |
| `Clock.sleep` | `Effect.sleep` |
| `Metric.trackDuration` | `Effect.trackDuration` |
| `Runtime.provideService` | `Effect.provideService` |
| `ParseResult.decodeUnknownOption`, `encodeUnknownOption`, `decodeOption`, `encodeOption` | the same names in `Schema` |
| `ParseResult.mapError`, `mapBoth`, `fromOption` | `Effect.mapError`, `Effect.mapBoth`, `Effect.fromOption` |
| `Schema.Simplify` | `Types.Simplify` |
| `SchemaAST.Annotations` | `Schema.Annotations` |
| `TRef.getAndSet`, `getAndUpdate`, `updateAndGet` | `TxRef.modify` |
| `TMap.removeIf`, `retainIf` | `TxHashMap.filter` |
| `TQueue.awaitShutdown`, `peekOption` | `TxQueue.awaitCompletion`, `TxQueue.peek` |
| `TestClock.sleep` | `Effect.sleep` with `TestClock.adjust` |
| `@effect/platform/HttpClientRequest.del` | `HttpClientRequest.delete` |
| `@effect/platform/HttpBody.fileWeb` | `HttpServerResponse.fileWeb` |
| `@effect/platform/CommandExecutor.Signal` | `ChildProcess.Signal` |
| `@effect/platform/PlatformConfigProvider.fromDotEnv` | `ConfigProvider.fromDotEnv` |
| `@effect/platform/HttpLayerRouter.*` (17 names) | the same names in `effect/http/HttpRouter` |
| `Take.die(defect)` | `Exit.die(defect)`: a v4 `Take` is an `Exit`; `Take.toPull` turns it into a `Die` |
| `Take.end` | `Exit.void`; `Take.toPull` turns it into `Cause.Done` |

No candidate exists in 4.0.0 for: `Cause.match`, `Data.tagged`, `Either.zipWith`, `Exit.zip`, `Fiber.dump`, `FiberRef.getAndSet`, `FiberRef.getAndUpdate`, `FiberRef.updateAndGet`, `TestClock.live`, `Schema.TupleType`, `Brand.errors`. Rebuild the behaviour from v4 primitives, or report the gap.

## Recipes

Each recipe below is type checked and was run against 4.0.0; the v3 behaviour it replaces was run against 3.22.2.

**`Effect.asyncEffect`**: v3 ran the effect returned from the callback as the registration. In v4 that effect runs only on interruption, so a mechanical port never registers (it timed out where v3 returned `"registered"`). Register in a scope, and hand the first event over through a `Deferred`, so that an event that arrives during registration is kept and the subscription closes on success too:

```ts
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"

declare const subscribe: (onEvent: (value: string) => void) => Effect.Effect<{ readonly unsubscribe: () => void }>

export const nextEvent = Effect.scoped(
  Effect.gen(function*() {
    const first = yield* Deferred.make<string>()
    yield* Effect.acquireRelease(
      subscribe((value) => Deferred.doneUnsafe(first, Effect.succeed(value))),
      (subscription) => Effect.sync(() => subscription.unsubscribe())
    )
    return yield* Deferred.await(first)
  })
)
```

**`Stream.async` and its variants**: v3 ran the returned effect as cleanup. In v4 the returned effect is the registration and runs at once, so a mechanical port unsubscribes before anything is consumed. Register cleanup as a finalizer, and pass `bufferSize` if you relied on the v3 default of 16 (v4 defaults to an unbounded queue):

```ts
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"

declare const listen: (onTick: (n: number) => void) => { readonly close: () => void }

export const ticks = Stream.callback<number>(
  (queue) =>
    Effect.gen(function*() {
      const listener = listen((n) => Queue.offerUnsafe(queue, n))
      yield* Effect.addFinalizer(() => Effect.sync(() => listener.close()))
    }),
  { bufferSize: 16 }
)
```

**`FiberRef.set`**: v4 references are read-only within a fiber. Wrap the work that must see the value; use a `Ref` for state that changes over time or that a parent reads after joining a child:

```ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Ref from "effect/Ref"

const TenantId = Context.Reference<string>("TenantId", { defaultValue: () => "public" })

export const scoped = Effect.gen(function*() {
  return yield* TenantId
}).pipe(Effect.provideService(TenantId, "acme"))

export const shared = Effect.gen(function*() {
  const progress = yield* Ref.make(0)
  const child = yield* Effect.forkChild(Ref.set(progress, 42))
  yield* Fiber.join(child)
  return yield* Ref.get(progress)
})
```

**`ConfigProvider.fromMap`**: expand the delimited keys into a nested object, then use `fromUnknown`:

```ts
import * as ConfigProvider from "effect/ConfigProvider"

export const fromFlatMap = (entries: ReadonlyMap<string, string>, delimiter = ".") => {
  const root: Record<string, unknown> = {}
  for (const [key, value] of entries) {
    const parts = key.split(delimiter)
    let node = root
    for (const part of parts.slice(0, -1)) {
      const next = node[part]
      node = typeof next === "object" && next !== null ? (next as Record<string, unknown>) : (node[part] = {})
    }
    node[parts[parts.length - 1]!] = value
  }
  return ConfigProvider.fromUnknown(root)
}
```

**`Queue.takeUpTo(q, n)`**: loop on `Queue.poll`, which never waits:

```ts
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"

export const takeUpTo = <A>(queue: Queue.Dequeue<A>, n: number) =>
  Effect.gen(function*() {
    const taken: Array<A> = []
    while (taken.length < n) {
      const next = yield* Queue.poll(queue)
      if (next._tag === "None") break
      taken.push(next.value)
    }
    return taken
  })
```

