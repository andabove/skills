# Schedule

Reference for [effect-concurrency](../SKILL.md). Checked against `effect@4.0.0`.

A `Schedule<Output, Input, Error, Env>` decides, after each run, whether to run again and how long to wait. It receives an `Input` (the error for `retry`, the value for `repeat`) and emits an `Output`.

## Where a schedule runs

| Function | Runs the effect again | First run | Succeeds with |
| --- | --- | --- | --- |
| `Effect.retry(policy)` | After a failure | Immediately | The effect's value |
| `Effect.retry({ schedule, times, while, until })` | After a failure that passes the predicates | Immediately | The effect's value |
| `Effect.repeat(schedule)` | After a success | Immediately | The schedule's last output |
| `Effect.repeat({ schedule, times, while, until })` | After a success that passes the predicates | Immediately | The effect's last value |
| `Effect.schedule(effect, schedule)` | After a success | After the first delay | The schedule's last output |
| `Effect.retryOrElse(policy, orElse)`, `Effect.repeatOrElse` | As above | Immediately | `orElse` handles the final failure |
| `Stream.retry`, `Stream.repeat`, `Stream.schedule`, `Stream.fromSchedule` | See [effect-streams](skill:effect-streams) | | |

- `retry` and `repeat` also accept a builder, `Effect.retry(($) => $(Schedule.spaced("1 second")).pipe(Schedule.while(({ input }) => ...)))`, which types the schedule's input from the effect.
- `repeat` and `schedule` stop at the first failure. Handle an expected failure inside the repeated effect when the loop must survive it.
- `Effect.forever(effect)` repeats with no delay until it fails or is interrupted.

## Counting

A schedule counts recurrences after the first run. Measured with `TestClock`:

| Policy | Runs |
| --- | --- |
| `Effect.retry(Schedule.recurs(2))` on an always-failing effect | 3, all at time 0 |
| `Effect.retry({ times: 2 })` | 3 |
| `Effect.retry(Schedule.exponential("100 millis").pipe(Schedule.upTo({ times: 3 })))` | 4, at 0, 100, 300, 700 ms |
| `Effect.repeat(Schedule.recurs(2))` | 3; succeeds with `2`, not the effect's value |
| `Effect.repeat({ schedule: Schedule.recurs(2) })` | 3; succeeds with the effect's value |
| `Effect.schedule(effect, Schedule.spaced("1 second").pipe(Schedule.upTo({ times: 2 })))` | 2, at 1 s and 2 s |

## Constructors

| Constructor | Delay | Output |
| --- | --- | --- |
| `Schedule.recurs(n)` | None; stops after `n` recurrences | Count |
| `Schedule.spaced(d)` | `d` after each run ends | Count |
| `Schedule.fixed(d)` | To the next boundary of a `d` grid that starts at the first recurrence; no catch-up when a run overruns | Count |
| `Schedule.windowed(d)` | Like `fixed`, but a run that overruns waits for the next boundary instead of starting at once | Count |
| `Schedule.exponential(base, factor = 2)` | `base`, `base * factor`, ... | Delay |
| `Schedule.fibonacci(one)` | `one`, `2 * one`, `3 * one`, `5 * one`, `8 * one`, ... | Delay |
| `Schedule.cron(expression, timeZone?)` or `Schedule.cron(cron)` | To the next matching time | Delay |
| `Schedule.forever` | None, never stops | Count |
| `Schedule.once` | None, one recurrence | `void` |
| `Schedule.during(d)` | None; recurs while elapsed time is at most `d`, and stops once it exceeds `d` | Elapsed |
| `Schedule.duration(d)` | `d`, one recurrence | `d` |

Measured starts: with a 2 minute action and a 5 minute interval, `spaced` starts at 0, 7, 14, 21 minutes and `fixed` at 0, 7, 12, 17. With a 1.5 s action and a 1 s interval, `fixed` starts at 0, 2.5, 4, 5.5 s and `windowed` at 0, 2.5, 4.5, 6.5 s.

## Combinators

| Combinator | Effect |
| --- | --- |
| `Schedule.upTo({ times, duration })` | Stops when either limit is reached. `duration` is checked when the schedule steps, so it cannot cut a run short. |
| `Schedule.while(predicate)` | Continues while `predicate(metadata)` is true. The predicate may return an `Effect<boolean>`. |
| `Schedule.setInputType<I>()` | Sets the input type so `while`, `tap` and `modifyDelay` can read `metadata.input`. Place it before them. |
| `Schedule.modifyDelay((metadata) => Effect.succeed(newDelay))` | Replaces each delay. The callback returns an `Effect`. |
| `Schedule.addDelay((metadata) => Effect.succeed(extra))` | Adds to each delay. |
| `Schedule.jittered` | Scales each delay by a random factor from 0.8 to 1.2. |
| `Schedule.tap((metadata) => effect)` | Runs an effect for each decision, before the wait. A failure in it fails the retrying effect. |
| `Schedule.map((metadata) => output)` | Changes the output. |
| `Schedule.max([a, b])` | Continues while every schedule continues; waits the longest delay. |
| `Schedule.min([a, b])` | Continues while any schedule continues; waits the shortest delay. |
| `Schedule.concat(a, b)` / `a.pipe(Schedule.concat(b))` | Runs `a` to its end, then `b`. `Schedule.concatResult` tags which phase produced each output. |
| `Schedule.passthrough(schedule)` | Outputs the input instead of the schedule's own output. |

Measured delays with an always-failing effect and `Schedule.upTo({ times: 5 })`:

| Policy | Delays |
| --- | --- |
| `Schedule.max([Schedule.exponential("250 millis"), Schedule.spaced("1 second")])` | 1 s, 1 s, 1 s, 2 s, 4 s |
| `Schedule.min([Schedule.exponential("250 millis"), Schedule.spaced("1 second")])` | 250 ms, 500 ms, 1 s, 1 s, 1 s |

So `max` with `spaced` sets a floor, and `min` with `spaced` sets a cap.

### Metadata

Callbacks of `while`, `tap`, `map`, `modifyDelay` and `addDelay` receive:

| Field | Meaning |
| --- | --- |
| `input` | The error (retry) or value (repeat) of the run that just ended. |
| `attempt` | The recurrence number, starting at 1 for the first retry or repeat. |
| `output` | The schedule's output for this step. |
| `duration` | The delay chosen for this step. |
| `elapsed`, `elapsedSincePrevious`, `start`, `now` | Timing in milliseconds. |

## Recipes

### Follow a server's Retry-After

```ts
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"

class RateLimited extends Schema.TaggedError<RateLimited>()("RateLimited", {
  retryAfterMillis: Schema.Number
}) {}
declare const download: Effect.Effect<string, RateLimited>

// Wait the longer of the backoff and the server's delay, at most 4 retries.
const policy = Schedule.exponential("1 second").pipe(
  Schedule.setInputType<RateLimited>(),
  Schedule.modifyDelay(({ duration, input }) =>
    Effect.succeed(Duration.max(duration, Duration.millis(input.retryAfterMillis)))
  ),
  Schedule.upTo({ times: 4 })
)

export const downloadWithRetry = download.pipe(Effect.retry(policy))
```

### Poll until a job is done

```ts
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"

type Status = { readonly _tag: "Pending" } | { readonly _tag: "Ready"; readonly url: string }
declare const checkStatus: Effect.Effect<Status, Error>

// At most 30 checks, 2 s apart. Ends early when the job is ready.
export const waitForReady = checkStatus.pipe(
  Effect.repeat({ schedule: Schedule.spaced("2 seconds"), times: 29, until: (status) => status._tag === "Ready" }),
  Effect.flatMap((status) =>
    status._tag === "Ready" ? Effect.succeed(status.url) : Effect.fail(new Error("job not ready after 30 checks"))
  )
)
```

### Bound the whole operation or each attempt

```ts
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"

declare const request: Effect.Effect<string, Error>

// One deadline for every attempt and every wait.
export const wholeOperation = request.pipe(Effect.retry(Schedule.spaced("1 second")), Effect.timeout("10 seconds"))
// Each attempt gets 2 seconds; a timeout is retried like any other failure.
export const perAttempt = request.pipe(Effect.timeout("2 seconds"), Effect.retry(Schedule.recurs(3)))
```

## Cron

- A cron expression has five fields (minute, hour, day of month, month, weekday) or six with seconds first. When both day fields are restricted, a date matches when either matches.
- `Cron.parse(expression, timeZone?)` returns a `Result<Cron, CronParseError>`. Parse configuration at startup with `Effect.fromResult(Cron.parse(...))` so a bad expression fails before the job is scheduled.
- `Schedule.cron("...")` with a string carries `CronParseError` in its error type; an invalid string fails when the schedule first runs, not when you build it.
- Pass a named time zone (`"America/New_York"`) for local business hours, `"UTC"` for a fixed clock. Test dates around daylight-saving changes.
- `Cron.next(cron, from)` and `Cron.sequence(cron, from)` preview the next run times.
- Run a cron job with `Effect.schedule(job, Schedule.cron(cron))` in a fiber you own (`Effect.forkScoped` in a layer). It waits for the first match and does not recover runs missed while the process was down.

```ts
import * as Cron from "effect/Cron"
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"

declare const sendReport: Effect.Effect<void>

export const reportJob = Effect.gen(function*() {
  const cron = yield* Effect.fromResult(Cron.parse("30 6 * * 1-5", "America/New_York"))
  yield* Effect.forkScoped(Effect.schedule(sendReport, Schedule.cron(cron)))
})
```

## Testing schedules

Provide `TestClock.layer()` from `effect/testing/TestClock`, fork the scheduled effect, move time with `TestClock.adjust`, then join. Read the time inside the effect with `Clock.currentTimeMillis` to assert when each run happened. See [effect-testing](skill:effect-testing).

```ts
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Schedule from "effect/Schedule"
import * as TestClock from "effect/testing/TestClock"

declare const flaky: Effect.Effect<string, Error>

export const retriesWithinTenSeconds = Effect.gen(function*() {
  const fiber = yield* Effect.forkChild(flaky.pipe(Effect.retry(Schedule.exponential("1 second").pipe(Schedule.upTo({ times: 3 })))))
  yield* TestClock.adjust("10 seconds")
  return yield* Fiber.await(fiber)
}).pipe(Effect.provide(TestClock.layer()))
```
