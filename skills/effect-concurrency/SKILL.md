---
name: effect-concurrency
description: Effect concurrency - fibers, interruption, coordination and Schedule. Use when running effects in parallel with Effect.all or Effect.forEach, forking, joining, racing, timing out or interrupting fibers, wrapping a cancellable Promise or callback API, coordinating fibers with Deferred, Queue, PubSub, Semaphore, Latch or Ref, or retrying, repeating and polling with Schedule.
---

# Effect concurrency

Checked against `effect@4.0.0`. When the project has a newer version, check each API you use in `node_modules/effect/src/<Module>.ts` and read `node_modules/effect/AGENTS.md` first. The source wins over this skill.

Every example imports each module from its subpath, `import * as Effect from "effect/Effect"`. The `effect` index import also works, but it loads every module: measured on Node, 216 modules in 220 to 270 ms cold, against 64 modules in 60 to 70 ms for `effect/Effect`.

Every effect runs on a fiber, a light thread that the Effect runtime schedules. Concurrency in Effect is structured: a fiber you start belongs to a parent fiber or a `Scope`, and interruption runs every finalizer before the interrupter resumes.

## Choose the tool

| Need | Use |
| --- | --- |
| Run a known set or a list of effects, with a limit | `Effect.all`, `Effect.forEach` with `concurrency` |
| Run work in the background and come back for it | `Effect.forkChild`, then `Fiber.join` / `Fiber.await` / `Fiber.interrupt` |
| Keep a changing set of background fibers | `FiberSet`, `FiberMap` (by key), `FiberHandle` (one at a time) |
| Take the first result | `Effect.race`, `Effect.raceAll`, `Effect.raceFirst`, `Effect.raceAllFirst` |
| Bound the time of an effect | `Effect.timeout`, `Effect.timeoutOption`, `Effect.timeoutOrElse` |
| Wrap a Promise or callback API that can be cancelled | `Effect.tryPromise` with its `signal`, `Effect.callback` |
| Signal once, gate, limit, hand off, broadcast, share state | `Deferred`, `Latch`, `Semaphore`, `Queue`, `PubSub`, `Ref` |
| Retry, repeat, poll, run at calendar times | `Effect.retry`, `Effect.repeat`, `Effect.schedule` with a `Schedule` |

Reach for `Effect.all`, `Effect.forEach` and the race functions first. Fork by hand only when the work must outlive the expression that starts it.

## Run effects in parallel

`Effect.all` takes a tuple, an iterable or a record of effects and keeps that shape. `Effect.forEach` maps a function over an iterable. Both take the same options:

| Option | Values | Effect |
| --- | --- | --- |
| `concurrency` | omitted, a number, `"unbounded"` | Omitted runs one at a time, in order. A number caps the running fibers. Results keep input order in every mode. |
| `discard` | `true` | Drops the results and succeeds with `void`. |
| `mode` (`Effect.all` only) | `"result"` | Turns each typed failure into a `Result` and runs the rest. A defect or an interruption still ends the combined effect, and effects not yet run do not run. |

When one effect fails (default mode):

- Sequential: the rest never start.
- Concurrent: the first failure makes the combined effect interrupt every sibling that is still running and wait for their finalizers. Effects not yet started never start. The `Cause` starts with that first failure, and can also hold the failure of an uninterruptible sibling and a defect from a sibling's finalizer. A sibling that is interrupted before it fails adds nothing.
- To keep going after a typed failure, use `mode: "result"`, `Effect.partition` (splits successes and failures) or `Effect.validate` (collects every failure). To keep going after defects too, map each effect through `Effect.exit` and inspect each `Exit`. An interruption of the whole call still stops everything.

```ts
import * as Effect from "effect/Effect"

declare const loadInvoice: (id: string) => Effect.Effect<{ readonly total: number }, Error>

export const totals = Effect.fn("totals")(function*(ids: ReadonlyArray<string>) {
  // At most 4 requests in flight. The first failure interrupts the others.
  const invoices = yield* Effect.forEach(ids, loadInvoice, { concurrency: 4 })
  return invoices.reduce((sum, invoice) => sum + invoice.total, 0)
})
```

`Effect.zip(a, b, { concurrent: true })` runs a pair concurrently. A bare `Effect.zip` is sequential.

## Fork fibers

| Fork | The fiber ends when |
| --- | --- |
| `Effect.forkChild(effect)` | It completes, or the fiber that forked it ends. |
| `Effect.forkScoped(effect)` | It completes, or the `Scope` in context closes. Adds `Scope` to the requirements. |
| `Effect.forkIn(effect, scope)` | It completes, or the given `scope` closes. |
| `Effect.forkDetach(effect)` | It completes, or something interrupts it. Nothing supervises it. |

- `forkChild` ties the child to the parent fiber, not to the `Effect.gen` block or function that forked it. A helper that forks and returns leaves the child running until its caller's whole fiber ends. When a block must own its children, run it as its own fiber, wrap it in `Effect.scoped` with `forkScoped`, or interrupt the child before it returns.
- A forked fiber starts after the current fiber yields. Pass `{ startImmediately: true }` when it must start before the next line, for example to subscribe before you publish.
- `Fiber.join(fiber)` resumes with the fiber's value or re-raises its failure. `Fiber.await(fiber)` returns its `Exit` and never fails. `Fiber.interrupt(fiber)` returns `void` after the fiber's finalizers finish.
- `Effect.awaitAllChildren(effect)` delays completion until every child that `effect` forked has finished.
- Forked fibers in a long-running service belong in a `FiberSet`, `FiberMap` or `FiberHandle` created in the service's scope, so that closing the scope interrupts them.

Lifetimes, the `Fiber` API and the fiber collections are in [effect-concurrency-fibers.md](references/effect-concurrency-fibers.md).

## Interruption

- Interruption comes from outside the fiber: `Fiber.interrupt`, a lost race, a timeout, a failed sibling, a closed scope, or the `signal` passed to `Effect.runPromise`. `Effect.interrupt` interrupts the current fiber.
- The interrupter waits for the target's finalizers (`Effect.onInterrupt`, `Effect.ensuring`, `Effect.acquireRelease`). A slow finalizer delays the caller.
- `Effect.timeout(duration)` interrupts the source and fails with `Cause.TimeoutError`. If the source is uninterruptible, the timeout returns only when the source ends, and still fails with `TimeoutError`: the result is lost. Keep uninterruptible regions short.
- Mark a critical section with `Effect.uninterruptibleMask((restore) => ...)` and wrap only the waits that may stop in `restore`. `Effect.uninterruptible` protects the whole effect.
- Interruption appears in an `Exit` as an `Interrupt` reason in the `Cause`, not as a typed error. See [effect-errors](skill:effect-errors).

## Wrap a cancellable API

When a fiber that waits on `Effect.tryPromise` or `Effect.promise` is interrupted, it ends at once: `Effect.runPromiseExit` resolves without waiting for the Promise to settle. The underlying call stops only if it observes the `AbortSignal` that Effect passes to the `try` function.

- Declare the `signal` parameter in the function you pass, and pass it to the call (`fetch`, an SDK option, a stream). Effect creates the `AbortController` only when that function declares a parameter: a `(...args) => call(...args)` wrapper receives `undefined`.
- An API with no cancellation runs on after the interruption. Its result is dropped.

```ts
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

class FetchError extends Schema.TaggedError<FetchError>()("FetchError", { cause: Schema.Defect() }) {}

export const getJson = Effect.fn("getJson")((url: string) =>
  Effect.tryPromise({
    // The signal aborts when the fiber is interrupted, so the request stops too.
    try: (signal) => fetch(url, { signal }).then((response): Promise<unknown> => response.json()),
    catch: (cause) => new FetchError({ cause })
  })
)
```

Use `Effect.callback` when the call must settle before the fiber ends (a job that must confirm its cancel, a server that must close). The register function may return an effect. On interruption Effect runs that effect and the fiber ends only after it completes, so make it wait for the API's confirmation:

```ts
import * as Effect from "effect/Effect"

interface Job {
  cancel(onCancelled: () => void): void
}
declare const startJob: (onDone: (result: string) => void) => Job

export const runJob = Effect.callback<string>((resume) => {
  const job = startJob((result) => resume(Effect.succeed(result)))
  // Runs on interruption. The fiber ends when the API confirms the cancel.
  return Effect.callback<void>((resumeCancel) => {
    job.cancel(() => resumeCancel(Effect.void))
  })
})
```

`Effect.callback((resume, signal) => ...)` also receives an `AbortSignal` when it declares the second parameter. Call `resume` once; later calls are ignored. `Effect.abortSignal` gives a signal that aborts when its `Scope` closes.

## Race

| Function | Winner | When all fail |
| --- | --- | --- |
| `Effect.race(a, b)` | First success. A failure does not win. | Fails with both failures in the `Cause`. |
| `Effect.raceAll(effects)` | First success. | Fails with every failure in the `Cause`. |
| `Effect.raceFirst(a, b)` | First to finish, success or failure. | - |
| `Effect.raceAllFirst(effects)` | First to finish, success or failure. | - |

The losers are interrupted, and the race waits for their finalizers. `race` and `raceFirst` take `{ onWinner }` to observe the winning fiber.

## Coordinate fibers and share state

| Module | Use it for | Trap |
| --- | --- | --- |
| `Deferred` | A value or failure that one fiber sets once and many await. | Later completions return `false` and change nothing. |
| `Latch` | A gate: fibers wait at `latch.await` or `latch.whenOpen(effect)` until `latch.open`. | `Latch.make()` starts closed. |
| `Semaphore` | Limit access: `sem.withPermits(n)(effect)`, `sem.withPermit(effect)`. | Permits come back on failure and interruption too. |
| `Queue` | Hand each value to one consumer, with back-pressure. | `Queue.end` needs the error type to include `Cause.Done`. `shutdown` drops buffered values. |
| `PubSub` | Send each value to every current subscriber. | A subscriber sees only messages published after it subscribed, unless you set `replay`. |
| `Ref` | Shared state with atomic `update` and `modify`. | `get` then `set` across a yield loses updates. Use `update` or `modify`. |
| `SynchronizedRef` | State whose update runs an effect (`updateEffect`), one update at a time. | The effect runs while other updates wait. Keep it short. |
| `SubscriptionRef` | State that others watch through `SubscriptionRef.changes` (a `Stream`). | `changes` emits the current value first, then each change. |

Signatures, queue strategies and completion, and examples are in [effect-concurrency-coordination.md](references/effect-concurrency-coordination.md).

## Schedule: retry, repeat, poll

- `Effect.retry(policy)` runs again after a failure. `Effect.repeat(policy)` runs again after a success. `Effect.schedule(effect, policy)` waits for the first delay before the first run. The first run of `retry` and `repeat` is immediate.
- A schedule counts recurrences, not runs. `Schedule.recurs(2)`, `{ times: 2 }` and `Schedule.upTo({ times: 2 })` each allow 3 runs in total.
- `Effect.repeat(schedule)` succeeds with the schedule's last output (for `Schedule.recurs` a count), not the effect's value. Pass options, `Effect.repeat({ schedule, until, while, times })`, to keep the effect's value. `Effect.retry` succeeds with the effect's value in both forms.
- `Schedule.spaced(d)` waits `d` after each run ends. `Schedule.fixed(d)` keeps a grid of `d` that starts at the first recurrence, so with a 2 minute action and a 5 minute `fixed` the starts are 0, 7, 12, 17 minutes.
- Combine with `Schedule.max([a, b])` (continue while both continue, take the longer delay), `Schedule.min([a, b])` (continue while either continues, take the shorter delay), `Schedule.concat` (phases), `Schedule.upTo({ times, duration })`, `Schedule.jittered` (each delay times 0.8 to 1.2).
- To decide from the error, call `Schedule.setInputType<YourError>()` before `Schedule.while(({ input }) => ...)`, or pass `Effect.retry({ schedule, while: (error) => ... })`.
- `Effect.timeout` after `Effect.retry` bounds the whole operation with its waits. `Effect.timeout` before `Effect.retry` bounds each attempt.
- Schedules live in the running process. They do not persist or replay missed runs.

```ts
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"

class HttpError extends Schema.TaggedError<HttpError>()("HttpError", { status: Schema.Number }) {}
declare const callApi: Effect.Effect<string, HttpError>

// Backoff from 200 ms, capped at 5 s before jitter (0.8x to 1.2x), at most 6 retries, only for 5xx.
const retryPolicy = Schedule.min([Schedule.exponential("200 millis"), Schedule.spaced("5 seconds")]).pipe(
  Schedule.jittered,
  Schedule.upTo({ times: 6 }),
  Schedule.setInputType<HttpError>(),
  Schedule.while(({ input }) => input.status >= 500)
)

export const resilientCall = callApi.pipe(Effect.retry(retryPolicy), Effect.timeout("30 seconds"))
```

Constructors, combinators, schedule metadata, cron and testing with `TestClock` are in [effect-concurrency-schedule.md](references/effect-concurrency-schedule.md).

## Related skills

- [effect](skill:effect) for the core, `Effect.gen` and `Effect.fn`, and running effects.
- [effect-errors](skill:effect-errors) for `Cause`, `Exit` and choosing a retry or timeout as error policy.
- [effect-services](skill:effect-services) for `Scope`, `Layer` and background work in a layer.
- [effect-streams](skill:effect-streams) for sequences of values over time.
- [effect-testing](skill:effect-testing) for `TestClock` and testing concurrent code.
