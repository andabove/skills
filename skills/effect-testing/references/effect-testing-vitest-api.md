# @effect/vitest 4.0.0 and the test services: API detail

Read from `@effect/vitest/src/index.ts`, `@effect/vitest/src/internal/internal.ts`, `@effect/vitest/src/utils.ts` and `effect/src/testing/` at 4.0.0. For the rules, see [SKILL.md](../SKILL.md).

## Install

```sh
npm install -D vitest@^5 @effect/vitest
```

`@effect/vitest` 4.0.0 has peer dependencies `vitest >=5.0.0 <6.0.0` and `effect ^4.0.0`.

## Exports of @effect/vitest

| Export | Shape |
|---|---|
| `it` | Vitest's `it`, plus `effect`, `live`, `layer`, `prop`, `flakyTest`. |
| `effect`, `live`, `layer`, `prop`, `flakyTest` | The same helpers as top-level functions. |
| `makeMethods(testApi)` | The helpers for another Vitest test API, such as `test.extend(...)`. |
| `describeWrapped(name, (it) => ...)` | A `describe` block that passes the helpers in. |
| `addEqualityTesters()` | Registers an empty list of equality testers in 4.0.0. It changes nothing. |
| Everything from `vitest` | `describe`, `expect`, `assert`, `vi`, `beforeEach`, `test`, and the rest. |

`@effect/vitest/utils` has assertion helpers: `assertEquals` (by `Equal.equals`), `deepStrictEqual`, `strictEqual`, `assertTrue`, `assertFalse`, `assertInclude`, `assertMatch`, `assertInstanceOf`, `throws`, `throwsAsync`, `assertNone`, `assertSome`, `assertDefined`, `assertUndefined`, `assertSuccess`, `assertFailure` (for `Result`), `assertExitSuccess`, `assertExitFailure`. `assertExitFailure` takes a `Cause` and compares it whole, annotations included, so it fails for code that uses `Effect.fn`; see [SKILL.md](../SKILL.md).

## it.effect and it.live

```ts nocheck
it.effect(name, (ctx) => effect, timeout?: number | TestOptions)
it.effect.each(cases)(name, (testCase, ctx) => effect, timeout?)
it.effect.prop(name, arbitraries, (values, ctx) => effect, timeout?)
// also .skip, .only, .fails, .skipIf(condition), .runIf(condition); the same on it.live
```

- `it.effect` provides `TestConsole.layer` and `TestClock.layer()`, and wraps the test in `Effect.scoped`.
- `it.live` wraps the test in `Effect.scoped` and provides nothing else.
- The test's Effect runs with Vitest's `ctx.signal`, so a Vitest timeout interrupts the fiber. Finalizers run, and Vitest waits for them.
- A failure is logged with `Cause.prettyErrors` and then fails the test.

## layer and it.layer

```ts nocheck
layer(L, options?)(name, (it) => { ... }) // a describe block
layer(L, options?)((it) => { ... })       // no new describe block
// options: { concurrent?: boolean, memoMap?: Layer.MemoMap, timeout?: Duration.Input, excludeTestServices?: boolean }
```

- The layer is built once for the block, before its first test, and its scope closes after the last test.
- Without `excludeTestServices: true`, the block also gets `TestClock` and `TestConsole`.
- `timeout` is the timeout of the hooks that build and close the layer.
- `concurrent` overrides the suite's concurrency for a named block. An anonymous block inherits it.
- The `it` inside the block has `effect`, `prop`, `flakyTest` and a nested `layer`, but no `live`. A nested `it.layer(L2)` builds `L2` on top of the outer layer and shares the outer build.

```ts
import { assert, layer } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

class Catalog extends Context.Service<Catalog, {
  readonly names: ReadonlyArray<string>
}>()("app/Catalog") {
  static readonly layerTest = Layer.succeed(Catalog, Catalog.of({ names: ["a1", "b2"] }))
}

layer(Catalog.layerTest)("Catalog", (it) => {
  it.effect("lists the names", () =>
    Effect.gen(function*() {
      const catalog = yield* Catalog
      assert.deepStrictEqual(catalog.names, ["a1", "b2"])
    }))
})
```

## Fixtures with makeMethods

```ts
import { assert, makeMethods, test } from "@effect/vitest"
import * as Effect from "effect/Effect"

const it = makeMethods(test.extend("baseUrl", { scope: "file" }, () => "http://localhost:4010"))

it.effect("reads the fixture", ({ baseUrl }) =>
  Effect.sync(() => {
    assert.strictEqual(new URL(baseUrl).port, "4010")
  }))
```

- Destructure the fixtures in the parameter. Vitest reads the parameter's source to choose fixtures, and fails with `FixtureParseError` on `(ctx) =>` once a fixture is defined.
- Property tests get no fixtures.
- Build `makeMethods` from `test` or `test.extend(...)`, not from an API that a `describe` callback received.

## Property tests

`it.prop(name, arbitraries, (values) => boolean | void, timeout?)` and `it.effect.prop(...)` take an array or a record of `Schema` or `Arbitrary` values. A return of `false`, a throw, a typed failure or a defect falsifies the property and starts shrinking. Pass check options as `{ arbitrary: { ... } }` in the last argument; their type is `Arbitrary.CheckOptions`.

## flakyTest

`it.flakyTest(effect, timeout = "30 seconds")` scopes the effect and runs it again on any failure, up to 10 more times, while the elapsed time is within `timeout`. If it still fails, the test fails with a defect.

## Vitest 5 notes

- Use `{ concurrent: false }` in place of `describe.sequential`, `it.sequential` and `{ sequential: true }`, which Vitest 5 removed.
- In concurrent tests, use `ctx.expect` so snapshots and assertion counts belong to the right test.

## TestClock (effect/testing/TestClock)

| API | Use |
|---|---|
| `TestClock.adjust(duration)` | Move the clock forward and run every sleep due on or before the new time, in order. |
| `TestClock.setTime(timestamp)` | Set the clock to an epoch time in milliseconds, and run every sleep due. |
| `TestClock.withLive(effect)` | Run one effect on the real clock. |
| `TestClock.layer(options?)` | Provide a TestClock; `options.warningDelay` (default 1 second) sets when it logs that a test waits on time without moving the clock. |
| `TestClock.make(options?)`, `TestClock.testClockWith(f)` | Build a TestClock, or use the current one. |

The clock starts at 0 (1970-01-01T00:00:00Z). `Clock.currentTimeMillis`, `DateTime.now`, `Effect.sleep`, timeouts, retries and schedules all read it.

## TestConsole (effect/testing/TestConsole)

| API | Use |
|---|---|
| `TestConsole.logLines` | An Effect of every line written with `Console.log` and the default logger. |
| `TestConsole.errorLines` | An Effect of every line written with `Console.error`. |
| `TestConsole.layer`, `TestConsole.make`, `TestConsole.testConsoleWith(f)` | Provide, build, or use the current TestConsole. |
