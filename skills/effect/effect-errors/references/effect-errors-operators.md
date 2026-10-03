# Error operators

Checked against `effect` 4.0.0. Every operator here is exported from `effect/Effect`; read its doc comment in `node_modules/effect/src/Effect.ts` for the exact overloads.

## Raise

| Operator | Result |
| --- | --- |
| `Effect.fail(error)` | a failure with `error` |
| `Effect.failSync(() => error)` | a failure; builds the error on each run |
| `Effect.failCause(cause)` | ends with this exact `Cause` (use it to re-raise a cause you caught) |
| `Effect.die(defect)` | a defect |
| `Effect.orDie(effect)` | turns every failure into a defect; `E` becomes `never` |
| `yield* new TaggedErrorClass({ ... })` | a failure with that error, inside `Effect.gen` |

To turn a failure into a defect with a better message, map first: `effect.pipe(Effect.mapError((e) => new Error(`startup failed: ${e._tag}`)), Effect.orDie)`.

## Select and handle

```ts
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Filter from "effect/Filter"

class Timeout extends Data.TaggedError("Timeout")<{}> {}
class NotFound extends Data.TaggedError("NotFound")<{ readonly id: string }> {}
class Forbidden extends Data.TaggedError("Forbidden")<{ readonly status: number }> {}

declare const load: Effect.Effect<string, Timeout | NotFound | Forbidden>

export const oneTag = load.pipe(Effect.catchTag("NotFound", (e) => Effect.succeed(`missing ${e.id}`)))

export const manyTags = load.pipe(
  Effect.catchTags({
    NotFound: (e) => Effect.succeed(`missing ${e.id}`),
    Forbidden: () => Effect.succeed("hidden")
  })
)

export const sharedHandler = load.pipe(Effect.catchTag(["NotFound", "Forbidden"], () => Effect.succeed("unavailable")))

export const byPredicate = load.pipe(
  Effect.catchIf((e) => e._tag === "Forbidden" && e.status === 403, () => Effect.succeed("login again"))
)

export const byFilter = load.pipe(Effect.catchFilter(Filter.tagged("Timeout"), () => Effect.succeed("cached")))
```

`byPredicate` uses a plain boolean predicate on purpose. Written as a refinement, `(e): e is Forbidden => e.status === 403`, it would tell TypeScript that every `Forbidden` is handled: the result type drops `Forbidden` from `E`, while a `Forbidden` with status 401 still fails at runtime. The boolean form keeps `Forbidden` in `E`.

| Operator | Handles | Notes |
| --- | --- | --- |
| `Effect.catchTag(tag \| [tags], f)` | failures with that `_tag` | removes the tags from `E` |
| `Effect.catchTags({ Tag: f, ... })` | failures with the listed tags | one handler per tag |
| `Effect.catchIf(predicate, f)` | failures that match | a refinement `(e): e is X` removes all of `X` from `E`; write it only when the check matches every `X` |
| `Effect.catchFilter(filter, f)` | failures that a `Filter` selects | reusable selection; `Filter.tagged`, `Filter.fromPredicate` |
| `Effect.catch(f)` | every failure | |
| `Effect.catchEager(f)` | every failure | applies `f` at once when the effect is already a failure; otherwise the same as `catch` |
| `Effect.catchNoSuchElement` | `Cause.NoSuchElementError` | success becomes `Option.some`, the error becomes `Option.none()` |
| `Effect.catchDefect(f)` | defects | boundary use only |
| `Effect.catchCause(f)` | every cause, including interruptions raised inside | boundary use only |
| `Effect.catchCauseIf`, `Effect.catchCauseFilter` | causes that match | the handler also gets the cause |

## Errors with a reason

```ts
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"

class RateLimited extends Data.TaggedError("RateLimited")<{ readonly retryAfterSeconds: number }> {}
class QuotaExceeded extends Data.TaggedError("QuotaExceeded")<{}> {}
class ContentBlocked extends Data.TaggedError("ContentBlocked")<{ readonly category: string }> {}

class ProviderError extends Data.TaggedError("ProviderError")<{
  readonly reason: RateLimited | QuotaExceeded | ContentBlocked
}> {}

declare const complete: Effect.Effect<string, ProviderError>

export const waitOnRateLimit = complete.pipe(
  Effect.catchReason("ProviderError", "RateLimited", (reason) =>
    Effect.sleep(`${reason.retryAfterSeconds} seconds`).pipe(Effect.andThen(complete))
  )
)

export const perReason = complete.pipe(
  Effect.catchReasons("ProviderError", {
    QuotaExceeded: () => Effect.succeed("quota reached"),
    ContentBlocked: (reason) => Effect.succeed(`blocked: ${reason.category}`)
  })
)

export const flattened = complete.pipe(
  Effect.unwrapReason("ProviderError"),
  Effect.catchTag("QuotaExceeded", () => Effect.succeed("quota reached"))
)
```

- `catchReason` and `catchReasons` keep the parent error in `E` for the reasons they do not handle. Both take an optional last handler for the other reasons.
- `unwrapReason("ProviderError")` replaces the parent with its reasons in `E`, so `catchTag` and `catchTags` work on them.

## Fall back

| Operator | Behaviour |
| --- | --- |
| `Effect.orElseSucceed(() => value)` | any failure becomes `value`; `E` becomes `never` |
| `Effect.firstSuccessOf([a, b, c])` | runs in order until one succeeds; if all fail, fails with the last error; an empty list is a defect |
| `Effect.filterOrFail(predicate, (a) => error)` | fails when the success value does not match; a refinement narrows `A` |
| `Effect.filterOrElse(predicate, (a) => effect)` | runs another effect when the value does not match |

## Turn outcomes into values

| Operator | Type change | Sees |
| --- | --- | --- |
| `Effect.result(e)` | `Effect<Result<A, E>, never, R>` | failures |
| `Effect.option(e)` | `Effect<Option<A>, never, R>` | failures |
| `Effect.exit(e)` | `Effect<Exit<A, E>, never, R>` | every cause |
| `Effect.sandbox(e)` | `Effect<A, Cause<E>, R>` | every cause; undo with `Effect.catch((cause) => Effect.failCause(cause))` |
| `Effect.flip(e)` | `Effect<E, A, R>` | failures; useful in tests |
| `Effect.match(e, { onFailure, onSuccess })` | pure handlers for both channels | failures |
| `Effect.matchEffect(e, { onFailure, onSuccess })` | effectful handlers | failures |
| `Effect.matchCause` / `Effect.matchCauseEffect` | handlers get the `Cause` | every cause |

## Change the error

- `Effect.mapError((e) => ...)` changes `E`. Keep the original as `cause`.
- `Effect.mapBoth({ onFailure, onSuccess })` changes both channels.

## Observe without handling

| Operator | Runs on |
| --- | --- |
| `Effect.tapError(f)` | failures |
| `Effect.tapErrorTag("Tag", f)` | failures with that tag |
| `Effect.tapDefect(f)` | defects |
| `Effect.tapCause(f)` | every cause |
| `Effect.onError(f)` | every cause; `f` gets the cause and cannot change the outcome |
| `Effect.onExit(f)` | every exit, success included |

If a `tap*` observer fails, its failure replaces the original one: the caller sees the observer's error, not the error you meant to log. Make observers infallible, for example with `Effect.ignore`. A defect in an `onError` handler is added next to the original failure instead. (The v4 website says a failing tap is combined with the original outcome; a run against 4.0.0 shows the replacement.)

## Ignore

- `Effect.ignore` drops the success value and every failure. A defect or an interruption that comes alone still ends the effect; a defect next to a failure is dropped with it. `Effect.ignore({ log: true })` logs the failure first.
- `Effect.ignoreCause` drops everything, defects included. Use it for best-effort side work such as a metrics flush.

## Accumulate instead of failing fast

`Effect.all` and `Effect.forEach` stop at the first failure. To check every item:

```ts
import * as Effect from "effect/Effect"

const check = (n: number) => (n % 2 === 0 ? Effect.succeed(n) : Effect.fail(`${n} is odd`))

export const allOrErrors = Effect.validate([1, 2, 3, 4], check)

export const bothSides = Effect.partition([1, 2, 3, 4], check)

export const perItem = Effect.all([check(1), check(2)], { mode: "result" })
```

- `Effect.validate` succeeds with every value, or fails with a non-empty array of every error. Here: fails with `["1 is odd", "3 is odd"]`.
- `Effect.partition` never fails and returns `[successes, failures]`. Here: `[[2, 4], ["1 is odd", "3 is odd"]]`. The v4 website page on error accumulation shows the opposite order; the 4.0.0 source and a run agree on this one.
- `Effect.all(..., { mode: "result" })` returns a `Result` for each effect.
- All three accept `{ concurrency }`.
