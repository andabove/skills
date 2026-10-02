---
name: effect-testing
description: Testing Effect code with @effect/vitest, TestClock and test layers. Use when you write or review tests for Effect programs or services, control time in a test, replace a service with a test layer, or test an Effect module through its plain async function.
---

# Testing Effect code

Checked against `effect 4.0.0` and `@effect/vitest 4.0.0`, which needs `vitest` 5 (`>=5.0.0 <6.0.0`). When the project has newer versions, read `node_modules/@effect/vitest/src/index.ts`, `node_modules/effect/src/testing/TestClock.ts` and `node_modules/effect/AGENTS.md` before you trust a name here.

## Pick the boundary

- **A module that exports a plain async function** with an Effect program inside (see `skill:effect-adoption`): test that function with ordinary Vitest tests. The tests hold no Effect type. See [Test through the plain async edge](#test-through-the-plain-async-edge).
- **Effect programs and services** that other Effect code calls: test them with `@effect/vitest`, where each test returns an Effect.

## The helpers in @effect/vitest 4.0.0

| Helper | What the test gets |
|---|---|
| `it.effect(name, () => effect, timeout?)` | A `TestClock` at time 0, a `TestConsole`, and a fresh `Scope` that closes after the test. |
| `it.live(name, () => effect, timeout?)` | The real clock and console, and a fresh `Scope`. |
| `layer(L)(name, (it) => { ... })`, `it.layer(L)` | One build of `L` shared by every test in the block, plus the test services. |
| `it.effect.each(cases)(name, (testCase) => effect)` | One test for each case. |
| `it.effect.prop(name, arbitraries, (values) => effect)`, `it.prop` | A property test with inputs from `Schema` or `Arbitrary` values. |
| `it.flakyTest(effect, timeout?)` | The effect, run again on failure up to 10 times within `timeout` (30 seconds by default). |
| `makeMethods(test.extend(...))` | The same helpers, for a Vitest test with fixtures. |

`it.effect` and `it.live` also have `.skip`, `.only`, `.fails`, `.skipIf(condition)` and `.runIf(condition)`. Import `it`, `layer`, `assert`, `expect` and `describe` from `@effect/vitest`: it re-exports the Vitest API.

Write `it.effect`, not `it.scoped`. Version 4.0.0 has no `it.scoped` and no `it.scopedLive`, because `it.effect` and `it.live` already give each test a scope. `it.scoped` still resolves, to Vitest's deprecated fixture API: the test is not registered and its body never runs. A file with other tests passes; a file with only such tests fails with "No test suite found". Vitest does not type check, so only `tsc` catches it (`Expected 1 arguments, but got 2`). Run `tsc` over the test files.

Signatures and options for each helper are in [references/effect-testing-vitest-api.md](references/effect-testing-vitest-api.md).

## Write an it.effect test

```ts
import { assert, describe, it } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

class OutOfStock extends Data.TaggedError("OutOfStock")<{ readonly sku: string }> {}

class Stock extends Context.Service<Stock, {
  reserve(sku: string): Effect.Effect<number, OutOfStock>
}>()("app/Stock") {}

// The state is made inside the build, so each Effect.provide starts with one item.
const StockTest = Layer.effect(Stock, Effect.sync(() => {
  let left = 1
  return Stock.of({
    reserve: (sku) => Effect.suspend(() => left === 0 ? Effect.fail(new OutOfStock({ sku })) : Effect.succeed(--left))
  })
}))

describe("Stock", () => {
  it.effect("reserves the last item", () =>
    Effect.gen(function*() {
      const stock = yield* Stock
      assert.strictEqual(yield* stock.reserve("a1"), 0)
    }).pipe(Effect.provide(StockTest)))

  it.effect("fails with OutOfStock when no item is left", () =>
    Effect.gen(function*() {
      const stock = yield* Stock
      yield* stock.reserve("a1")
      const error = yield* Effect.flip(stock.reserve("a1"))
      assert.strictEqual(error._tag, "OutOfStock")
      assert.strictEqual(error.sku, "a1")
    }).pipe(Effect.provide(StockTest)))
})
```

- **Assert inside the Effect.** The test fails when the returned Effect fails, dies or throws.
- **Get an expected error with `Effect.flip`, and assert its `_tag` and fields.** `Effect.flip` turns the error into the success value.
- **Do not compare a whole failed `Exit`** with `assert.deepStrictEqual(exit, Exit.fail(error))` or `assertExitFailure`. Both compare the `Cause` and its annotations. When the code under test uses `Effect.fn`, the failure carries a stack trace annotation, and the comparison fails though the error is equal. Compare a whole `Exit` only in a test that controls the annotations.
- **Use the `@effect/vitest/utils` helpers** for values: `assertExitSuccess`, `assertSome`, `assertNone`, `assertSuccess`, `assertFailure` (for `Result`).
- **Read logs from `TestConsole`.** In `it.effect`, `Console.log` and `Effect.log` write to the `TestConsole`, not to the terminal. Read them with `yield* TestConsole.logLines` (or `errorLines`) from `effect/testing/TestConsole`. `it.live` prints them.
- **Expect cleanup on timeout.** A Vitest timeout interrupts the test fiber, and its finalizers run.

## Control time with TestClock

Under `it.effect`, time stands still until the test moves it. Fork the code that waits, move the clock, then join. Check both sides of a deadline: the fiber is still running just before it, and done at it. A test that only moves past the deadline also passes when the code times out too early.

```ts
import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as TestClock from "effect/testing/TestClock"

it.effect("times out a slow lookup at 5 seconds", () =>
  Effect.gen(function*() {
    const lookup = Effect.sleep("1 minute").pipe(Effect.as("found"))
    const fiber = yield* lookup.pipe(Effect.timeoutOption("5 seconds"), Effect.forkChild)
    yield* TestClock.adjust("4999 millis")
    assert.isUndefined(fiber.pollUnsafe())
    yield* TestClock.adjust("1 millis")
    assert.deepStrictEqual(yield* Fiber.join(fiber), Option.none())
  }))
```

- **Move the clock for every sleep.** A sleep that no test adjusts waits until the Vitest timeout. The TestClock warning is a log line, and `it.effect` sends it to the `TestConsole`, so you see only the timeout.
- **Make fakes settle at once.** `TestClock.adjust` yields between sleeps and checks again for sleeps that are due, so one adjust also drives a sleep that a woken fiber registers during the adjust: one 30 ms adjust runs retries at 0, 10, 20 and 30 ms. It cannot drive a sleep that is registered after the adjust has finished. That happens when a fake answers in a later macrotask (`setTimeout`, real I/O): the adjust ends while the call is pending, the retry delay starts later, and the fiber waits. A fake that returns `Promise.reject(...)`, `Promise.resolve(...)` or an Effect settles during the adjust.
- **Use `TestClock` only where the test clock is provided.** `it.effect`, `layer(...)` and `Effect.provide(TestClock.layer())` provide it. Under `it.live` or a plain `Effect.runPromise`, `TestClock.adjust` dies with `testClock.adjust is not a function`.
- **Read time through `Clock` or `DateTime.now`.** They follow the test clock, and `TestClock.setTime(Date.UTC(...))` sets a date. `Date.now()` and `new Date()` read the real time.
- **Run one step on the real clock** with `TestClock.withLive(effect)`.

## Replace a service with a test layer

- **Build a stateless fake with `Layer.succeed(Service, Service.of({ ... }))`.** For a partial fake, use `Layer.mock(Service, { ... })`: an omitted Effect member dies with `UnimplementedError` naming the method when a test calls it.
- **Make a stateful fake's state inside the build,** with `Layer.effect(Service, Effect.sync(() => { let state = ...; return Service.of({ ... }) }))`, as in the example above. Then `Effect.provide(TestLayer)` on each test's Effect gives each test fresh state. A fresh build does not reset state that the layer captured from outside: with `Layer.succeed` over a module-level variable, the second test sees what the first test left.
- **Share a layer across a block** with `layer(TestLayer)("name", (it) => { ... })` only for a resource that is costly to build or that no test changes. The block builds the layer once; a test sees the state that the tests before it left.
- **Expose the fake's state to the test** with `Layer.provideMerge`: build the state as its own service, and merge it into the fake's layer so the test can `yield*` it and assert on it.
- `layer(...)` adds `TestClock` and `TestConsole` unless you pass `{ excludeTestServices: true }`.

For services, layers and `Layer.provideMerge`, see `skill:effect-services`.

## Pin public signatures with a type test

A runtime test cannot see a lost case in an error type: the code that raised it is gone, and a declared return type still compiles (see `skill:effect-errors`). Pin each public Effect signature in a `*.test-d.ts` file with Vitest's `expectTypeOf`:

```ts
import * as Effect from "effect/Effect"
import { expectTypeOf } from "vitest"

class NotFound { readonly _tag = "NotFound" }
class StoreError { readonly _tag = "StoreError" }
declare const getItem: (id: string) => Effect.Effect<{ readonly id: string }, NotFound | StoreError>

expectTypeOf(getItem).returns.toEqualTypeOf<Effect.Effect<{ readonly id: string }, NotFound | StoreError>>()
expectTypeOf<Effect.Error<ReturnType<typeof getItem>>>().toEqualTypeOf<NotFound | StoreError>()
```

- Use `toEqualTypeOf`, not `toMatchTypeOf`: only equality fails when a case is lost.
- Run the file with the project's `tsc`, or with `vitest --typecheck`, which picks up `**/*.{test,spec}-d.?(c|m)[jt]s?(x)` by default. A plain `vitest run` does not check types.
- Break the signature once on purpose (drop a case from the body) and see the type test fail.

## Test through the plain async edge

A module adopted behind a plain async function needs no `@effect/vitest`. Test it as production calls it.

- **Pass fakes through the seams the function already has,** such as a client parameter, not through a module mock.
- **Record each call's signal in the fake,** and assert `signal.aborted === true` in every abort test. A test that checks only the rejection passes when the signal never reaches the call, because the Effect edge returns at once on abort.
- **Test an already-aborted signal** too. Effect runs a program up to its first async step before it reads the signal, so whether a call starts depends on the program's shape. Assert what the function promises.
- **Use Vitest fake timers for delays.** Effect's default clock uses the global timers, so after `vi.useFakeTimers()`, `await vi.advanceTimersByTimeAsync(ms)` runs Effect sleeps and retry delays. Call `vi.useRealTimers()` after each test.

The full method for moving a module, with an example test file, is in `skill:effect-adoption`.

## Related skills

- `skill:effect` - the core, running at the edge, house style.
- `skill:effect-adoption` - moving a Promise module to Effect behind its async function.
- `skill:effect-services` - services, layers and `Scope`.
- `skill:effect-errors` - tagged errors, `Exit` and `Cause`.
- `skill:effect-concurrency` - fibers, `Deferred`, `Queue` and `Schedule`, for tests that fork and wait.
