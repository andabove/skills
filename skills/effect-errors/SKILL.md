---
name: effect-errors
description: Effect error handling, for expected errors, defects and interruptions. Use when you define or raise a tagged error, recover with `Effect.catch*`, read a `Cause` or `Exit`, set a retry or timeout policy, or decide whether a failure is an error or a defect.
---

# Effect errors

Checked against `effect` 4.0.0. When the project has a newer version, check each API in `node_modules/effect/src/Effect.ts`, `Cause.ts` and `Exit.ts`, and read `node_modules/effect/AGENTS.md`. Load the `effect` skill too: it covers creating effects, `Effect.gen` and running.

## Three ways an effect can end badly

| Kind | What it means | Where it is | Typical source |
| --- | --- | --- | --- |
| **Failure** (expected error) | part of the domain: invalid input, not found, rate limited | the `E` in `Effect<A, E, R>` | `Effect.fail`, `yield* new SomeError(...)`, `Effect.try` with `catch` |
| **Defect** | a bug or a broken invariant | only in the `Cause`, as a `Die` reason | a throw in `Effect.sync`, a rejection in `Effect.promise`, `Effect.die`, `Effect.orDie` |
| **Interruption** | someone stopped the fiber | only in the `Cause`, as an `Interrupt` reason | a timeout, a lost race, `SIGINT` under `runMain`, `Fiber.interrupt` |

Decide by the caller: if a caller can do something useful about it (retry, fall back, show a message, map to an HTTP status), make it a failure in `E`. If no caller can, make it a defect and let it reach the edge, where it is logged.

## Define errors as tagged classes

```ts
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

export class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", {
  userId: Schema.String,
  message: Schema.String
}) {}

export class StoreUnavailable extends Data.TaggedError("StoreUnavailable")<{
  readonly cause: unknown
}> {
  override get message() {
    return "user store is unavailable"
  }
}

declare const queryUser: (id: string) => Effect.Effect<{ readonly name: string } | undefined, StoreUnavailable>

export const findUser = Effect.fn("findUser")(function*(userId: string) {
  const user = yield* queryUser(userId)
  if (user === undefined) {
    return yield* new UserNotFound({ userId, message: `no user with id ${userId}` })
  }
  return user
})
```

- Use `Schema.TaggedError` when the error crosses a boundary that encodes it: an HTTP API, RPC, a workflow, a queue, a log sink that needs JSON. Use `Data.TaggedError` for errors that stay in the process. `effect/Data` loads 15 modules, `effect/Schema` 113.
- Give each error a readable `message`: a `message` field, or a `get message()` override. Without one, `error.message` is the empty string and the logs say only the tag.
- Keep the original failure in a `cause` field (`cause: Schema.Defect()` in a schema error, `cause: unknown` in a data error). In a `Data.TaggedError` the field becomes the standard `Error.cause`.
- Make each `_tag` unique in the codebase. `catchTag` matches by the string, so two classes with one tag catch each other.
- Raise with `return yield* new UserNotFound({ ... })` in a generator, or `Effect.fail(new UserNotFound({ ... }))` in a pipeline. A tagged error instance is itself yieldable.
- Do not use strings or plain `Error` as `E`: callers cannot tell them apart with `catchTag`.

## Keep the error type honest

A declared error type can hide a missing case. A narrower error type fits a wider declared one, so when a change drops a case (a `NotFound` becomes a generic `StoreError`, and a 404 becomes a 500), a function declared with `Effect.fn.Return<A, NotFound | StoreError>` still compiles, and so does every caller.

- Let `Effect.fn` infer the error type from the body.
- Pin each public signature with a type test, `expectTypeOf` in a `*.test-d.ts` file. `toEqualTypeOf` fails when the inferred union loses a case or gains one.

```ts
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { expectTypeOf } from "vitest"

class NotFound extends Data.TaggedError("NotFound")<{ readonly id: string }> {}
class StoreError extends Data.TaggedError("StoreError")<{ readonly cause: unknown }> {}

interface Item { readonly id: string }
declare const query: (id: string) => Effect.Effect<Item | undefined, StoreError>

// No declared return type: the error type comes from the body.
export const getItem = Effect.fn("getItem")(function*(id: string) {
  const row = yield* query(id)
  if (row === undefined) return yield* new NotFound({ id })
  return row
})

// getItem.test-d.ts: fails to compile when the body stops raising NotFound.
expectTypeOf(getItem).returns.toEqualTypeOf<Effect.Effect<Item, NotFound | StoreError>>()
```

Checked with `tsc` on 4.0.0. With `NotFound` replaced by `StoreError` in the body, the declared form compiles, and the type test fails with `TS2344`. See `effect-testing` for running type tests.

## Recover

Pick the narrowest operator. Each one removes what it handles from `E`.

| You want to | Write |
| --- | --- |
| handle one tagged error | `Effect.catchTag("UserNotFound", (e) => ...)` |
| handle several tags with one handler | `Effect.catchTag(["UserNotFound", "Forbidden"], (e) => ...)` |
| handle several tags, each its own way | `Effect.catchTags({ UserNotFound: (e) => ..., Forbidden: (e) => ... })` |
| handle errors that match a predicate | `Effect.catchIf((e) => ..., (e) => ...)` |
| handle every expected error | `Effect.catch((e) => ...)` |
| handle one nested `reason` of a tagged error | `Effect.catchReason("AiError", "RateLimited", (r) => ...)` |
| replace any error with a value | `Effect.orElseSucceed(() => fallback)` |
| turn the error into a value | `Effect.result` (gives a `Result`), `Effect.option` (drops the error) |
| change the error type | `Effect.mapError((e) => new OtherError({ cause: e }))` |
| observe without handling | `Effect.tapError`, `Effect.tapErrorTag`, `Effect.tapCause` |
| give up: make it a defect | `Effect.orDie` |

What each operator sees when the cause holds one reason (proved against 4.0.0; for a cause with a failure and a defect, see **Mixed causes** below):

| Operator | Failure | Defect | Interruption |
| --- | --- | --- | --- |
| `catch`, `catchTag(s)`, `catchIf`, `result`, `option`, `match`, `ignore`, `orElseSucceed`, `retry`, `tapError` | yes | no | no |
| `catchDefect`, `tapDefect` | no | yes | no |
| `catchCause`, `matchCause`, `exit`, `sandbox`, `ignoreCause`, `tapCause`, `onError` | yes | yes | yes |

Traps:

- `Effect.catch` does not catch a defect on its own. A throw inside `Effect.sync` or a rejection inside `Effect.promise` passes through every typed handler. Wrap code that can throw with `Effect.try` or `Effect.tryPromise` and a `catch`.
- `Effect.ignore` and `Effect.result` keep a defect that comes alone. `Effect.ignoreCause` drops it; use it only where losing a bug report is acceptable.
- `catchCause` and `matchCause` also see an interruption that the effect raised itself (`Effect.interrupt`). If you recover from every cause, check `Cause.hasInterruptsOnly(cause)` first and re-raise it with `Effect.failCause(cause)`. An interruption from outside the fiber cannot be caught: the handler does not run.
- `try`/`catch` in an `Effect.gen` body does not see a failed effect (see the `effect` skill). Use the operators above.
- Recover from defects (`catchDefect`, `catchCause`) only at a boundary: a request handler that must answer 500, a plugin host, a worker loop that must survive one bad job.

### Mixed causes

A cause can hold a failure and a defect at once, for example when an operation fails and its finalizer dies: `["Fail", "Die"]`. Every typed handler, and `catchDefect` too, sees the failure, recovers, and drops the defect without a trace. `Effect.retry` retries such a cause and ends with only the last `Fail`. (v3 typed handlers did not recover a cause that held a defect.)

Where a lost defect matters (a cleanup that crashed, a pool that broke), check the whole cause first:

```ts
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"

declare const job: Effect.Effect<string, "Busy">

export const recovered = job.pipe(
  Effect.catchCause((cause) => (Cause.hasDies(cause) ? Effect.failCause(cause) : Effect.succeed("fallback")))
)

export const retried = job.pipe(
  Effect.sandbox,
  Effect.retry({ times: 3, while: (cause) => !Cause.hasDies(cause) }),
  Effect.catch((cause) => Effect.failCause(cause))
)
```

Both keep `["Fail", "Die"]` in the result: measured, the guarded `catchCause` fails with both reasons, and the sandboxed retry stops after one attempt with both reasons.

The full catalogue with examples, including `catchFilter`, `catchReasons`, `unwrapReason`, `firstSuccessOf`, `filterOrFail`, `validate` and `partition`: [references/effect-errors-operators.md](references/effect-errors-operators.md).

## Wrap code that throws

```ts
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

class PaymentDeclined extends Schema.TaggedError<PaymentDeclined>()("PaymentDeclined", {
  orderId: Schema.String,
  cause: Schema.Defect()
}) {}

declare const gateway: { charge(orderId: string, signal: AbortSignal): Promise<string> }

export const charge = Effect.fn("charge")((orderId: string) =>
  Effect.tryPromise({
    try: (signal) => gateway.charge(orderId, signal),
    catch: (cause) => new PaymentDeclined({ orderId, cause })
  })
)
```

Without `catch`, `Effect.try` and `Effect.tryPromise` fail with `Cause.UnknownError` and the original value sits in `error.cause`. Map it to a tagged error at the point of the call.

## Retry and time out

Retries and timeouts are error policy: put them where the caller knows the cost.

```ts
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"

declare const callInventory: Effect.Effect<number, { readonly _tag: "Unavailable" } | { readonly _tag: "BadRequest" }>

export const stock = callInventory.pipe(
  Effect.timeout("2 seconds"),
  Effect.retry({
    schedule: Schedule.exponential("100 millis"),
    times: 4,
    while: (error) => error._tag !== "BadRequest"
  })
)
```

- `Effect.retry({ times: n })` runs the effect at most `n + 1` times: one try and `n` retries. `Schedule.recurs(n)` counts the same way.
- A retry sees only failures: a cause with only a defect or an interruption is not retried. A cause with a failure and a defect is retried, and the defect is lost (see **Mixed causes**).
- `while` (or `until`) stops on the first error that it rejects, and that error is the result. Retry only errors that a second try can fix.
- `Schedule.exponential("100 millis")` waits 100, 200, 400 ms between tries. Add `times` or another stop: alone, it retries forever.
- `Effect.timeout(d)` fails with `Cause.TimeoutError` (tag `"TimeoutError"`) and interrupts the source. Inside the retry, as above, each try gets its own limit; outside the retry, the limit covers all tries together.
- `Effect.timeoutOrElse({ duration, orElse })` replaces the timeout with your own effect, for example a domain error. `Effect.timeoutOption` turns a timeout into `Option.none()`.
- An uninterruptible region delays the timeout until the region ends, so the caller can wait longer than the duration.
- Pass the `signal` of `Effect.tryPromise` to `fetch` and other abortable APIs. Otherwise the timeout interrupts the fiber but the request keeps running.

More schedules, `retryOrElse` and the policy shapes: [references/effect-errors-retry-timeout.md](references/effect-errors-retry-timeout.md).

## Read a Cause and an Exit

A `Cause<E>` holds a flat array `cause.reasons` of `Fail`, `Die` and `Interrupt` reasons. An `Exit<A, E>` is `Success` with a `value` or `Failure` with a `cause`.

```ts
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"

declare const job: Effect.Effect<string, Error>

export const report = Effect.gen(function*() {
  const exit = yield* Effect.exit(job)
  if (Exit.isSuccess(exit)) return exit.value
  if (Cause.hasInterruptsOnly(exit.cause)) return "cancelled"
  const failure = exit.cause.reasons.find(Cause.isFailReason)
  if (failure) return `failed: ${failure.error.message}`
  return yield* Effect.logError(Cause.pretty(exit.cause)).pipe(Effect.as("crashed"))
})
```

- `Cause.squash(cause)` gives one value to throw or log: the first failure, else the first defect.
- `Cause.pretty(cause)` renders every reason with stack traces. Inside `Effect.fn("name")` the trace names the function.
- A cause can hold more than one reason: a failure plus a failing finalizer gives `["Fail", "Die"]`.

Guards, extractors and how concurrent failures combine: [references/effect-errors-cause-and-exit.md](references/effect-errors-cause-and-exit.md).

## Group errors with a reason

When one source fails in many related ways (an AI provider, a payment gateway), define one tagged error with a `reason` field that holds a union of tagged errors. Callers that do not care catch the parent tag; callers that do use `Effect.catchReason("Parent", "ReasonTag", handler)`, or `Effect.unwrapReason("Parent")` to move the reasons into `E`.

## Report at the edge

- `NodeRuntime.runMain` logs a failed program's cause and exits with code 1 (see the `effect` skill).
- In a request handler, map each expected error to a response with `catchTags`, then map the rest with one `catchCause` that logs `Cause.pretty(cause)` and answers with a generic 500.
- Do not log an error and then fail with it again in the same layer: it is logged twice.
