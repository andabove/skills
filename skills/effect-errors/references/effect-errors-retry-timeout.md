# Retry and timeout policies

Checked against `effect` 4.0.0. `Effect.retry`, `Effect.retryOrElse` and the `timeout*` operators live in `node_modules/effect/src/Effect.ts`; schedules live in `Schedule.ts`. Schedule construction in depth belongs to `effect-concurrency`.

## Effect.retry

`Effect.retry` takes a `Schedule` or an options object:

| Option | Meaning |
| --- | --- |
| `times: n` | at most `n` retries after the first try, so `n + 1` runs |
| `schedule` | the delays and the stop rule; combined with `times`, the first limit reached stops |
| `while: (error) => boolean` | retry only while true; may return an `Effect<boolean>` |
| `until: (error) => boolean` | stop when true; may return an `Effect<boolean>` |

Measured with `{ schedule: Schedule.exponential("10 millis"), times: 3 }`: four runs, with gaps of 10, 20 and 41 ms.

```ts
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"

class HttpError extends Data.TaggedError("HttpError")<{ readonly status: number }> {}

declare const send: Effect.Effect<string, HttpError>

const isTransient = (error: HttpError) => error.status === 429 || error.status >= 500

export const resilientSend = send.pipe(
  Effect.timeout("3 seconds"),
  Effect.retry({
    schedule: Schedule.exponential("200 millis").pipe(Schedule.jittered),
    times: 5,
    while: (error) => error._tag === "TimeoutError" || isTransient(error)
  }),
  Effect.timeout("20 seconds")
)
```

This policy reads: each try may take 3 seconds; retry timeouts and transient statuses at most 5 times with jittered exponential backoff; the whole call may take 20 seconds.

Rules:

- Decide which errors are transient and retry only those. A 400 or a validation error fails the same way each time.
- Failures only: a cause with only a defect or an interruption ends the effect at once. A cause with a failure and a defect (a failed call whose finalizer died) is retried, and only the last `Fail` survives. To stop on defects, retry the sandboxed effect with `while: (cause) => !Cause.hasDies(cause)` (see **Mixed causes** in `SKILL.md`).
- Retry an idempotent operation, or make it idempotent first (an idempotency key). A timeout does not tell you whether the remote side did the work.
- Put the retry close to the call that fails, not around a whole workflow: a retry reruns everything inside it.

## Effect.retryOrElse

`Effect.retryOrElse(effect, schedule, (error, output) => fallback)` runs `fallback` when the schedule stops. It gets the last error and the schedule's output; with `Schedule.recurs(2)` the output is the retry count, `2`.

## Timeouts

| Operator | On timeout | Type |
| --- | --- | --- |
| `Effect.timeout(duration)` | fails with `Cause.TimeoutError` | `Effect<A, E \| TimeoutError, R>` |
| `Effect.timeoutOption(duration)` | succeeds with `Option.none()` | `Effect<Option<A>, E, R>` |
| `Effect.timeoutOrElse({ duration, orElse })` | runs `orElse()` | adds the types of `orElse` |

- Each one interrupts the source when the time is up, so the source's finalizers run before the timeout outcome.
- An uninterruptible source finishes first. Measured: an uninterruptible 80 ms sleep under `timeout("10 millis")` returned after 83 ms, and still failed with `TimeoutError`.
- To raise a domain error on timeout, use `timeoutOrElse` with `orElse: () => Effect.fail(new MyTimeout(...))`.
- `Cause.TimeoutError` has `_tag: "TimeoutError"`, so `Effect.catchTag("TimeoutError", ...)` handles it.
- Interruption stops the fiber, not the outside work. Pass the `signal` from `Effect.tryPromise` or `Effect.callback` to the API you call, so that it stops too.

## Where to put the policy

- In a service method, when every caller wants the same policy: the client knows the remote API's rate limits.
- At the call site, when callers differ: a background job can wait minutes, a request handler cannot.
- Not twice: a retry in the client and another in the caller multiply the attempts.
