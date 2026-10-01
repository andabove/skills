# Cause and Exit

Checked against `effect` 4.0.0. Read `node_modules/effect/src/Cause.ts` and `Exit.ts` for the full lists.

## The model

```text
Exit<A, E>  = Success { value: A } | Failure { cause: Cause<E> }
Cause<E>    = { reasons: ReadonlyArray<Reason<E>> }
Reason<E>   = Fail { error: E } | Die { defect: unknown } | Interrupt { fiberId }
```

A `Cause` is flat. v3's `Sequential`, `Parallel` and `Empty` nodes are gone: a combined cause is one array, and the empty cause has no reasons. `Cause.combine(a, b)` joins the arrays.

## Guards

| Question | Write |
| --- | --- |
| does it hold any failure, defect, interruption? | `Cause.hasFails(c)`, `Cause.hasDies(c)`, `Cause.hasInterrupts(c)` |
| was the fiber only interrupted? | `Cause.hasInterruptsOnly(c)` |
| what kind is this reason? | `Cause.isFailReason(r)`, `Cause.isDieReason(r)`, `Cause.isInterruptReason(r)` |
| is this value a cause? | `Cause.isCause(u)` |
| did the exit succeed? | `Exit.isSuccess(exit)` then `exit.value`; `Exit.isFailure(exit)` then `exit.cause` |

## Extract

| Need | Write | Returns |
| --- | --- | --- |
| the first typed error | `Cause.findError(c)` | a `Result` |
| the first typed error, as an `Option` | `Cause.findErrorOption(c)` | an `Option` |
| the first defect | `Cause.findDefect(c)` | a `Result` |
| every failure | `c.reasons.filter(Cause.isFailReason)` | reasons; read `.error` |
| one value to throw or log | `Cause.squash(c)` | the first failure, else the first defect, else an `Error("All fibers interrupted without error")` |
| a readable report | `Cause.pretty(c)` | a string with every reason and its stack |
| one `Error` per reason | `Cause.prettyErrors(c)` | an array of `Error` |
| handle both outcomes of an exit | `Exit.match(exit, { onSuccess, onFailure })` | your value |

`Effect.runPromise` and `Effect.runSync` throw `Cause.squash(cause)`, so a rejected promise from Effect carries only the first reason. Use `Effect.runPromiseExit` when you need all of them.

## What Cause.pretty prints

For a failure combined with a defect, without the stack lines:

```text
NotFound: no user 7
Error: pool closed
```

The first word is the error's `name`; a tagged error uses its tag. The text after the colon is `message`, which is empty unless the error class sets one (see `SKILL.md`). Inside `Effect.fn("name")` the stack lines name the function and its definition site.

## How causes combine

- `Effect.all` and `Effect.forEach` with concurrency stop at the first failure and interrupt the rest. Measured: two effects that fail at once give a cause with one `Fail`, not two.
- A finalizer that fails adds a `Die` next to the original reason. Measured: `Effect.fail("op").pipe(Effect.ensuring(Effect.die("cleanup")))` gives `["Fail", "Die"]`.
- An `onError` handler that dies adds a `Die` the same way.
- A failing `tap*` observer replaces the original failure (see `effect-errors-operators.md`).

To keep every domain error of a batch, accumulate them as data with `Effect.validate` or `Effect.partition` instead of reading them from a cause.

## Built-in error classes

| Class | Raised by | Guard |
| --- | --- | --- |
| `Cause.NoSuchElementError` | `Effect.fromOption`, `Effect.fromNullishOr` | `Cause.isNoSuchElementError` |
| `Cause.TimeoutError` | `Effect.timeout` | `Cause.isTimeoutError` |
| `Cause.UnknownError` | `Effect.try`, `Effect.tryPromise` without `catch` | `Cause.isUnknownError` |
| `Cause.IllegalArgumentError` | invalid arguments, for example to `DateTime` and `Url` constructors | `Cause.isIllegalArgumentError` |
| `Cause.ExceededCapacityError` | an `RcMap` past its capacity | `Cause.isExceededCapacityError` |
| `Cause.AsyncFiberError` | `Effect.runSync` on async work | `Cause.isAsyncFiberError` |

Each has a `_tag` equal to its class name, so `catchTag("TimeoutError", ...)` works. In v3 these were `*Exception` classes.

## Build causes and exits by hand

For tests and adapters: `Cause.fail(e)`, `Cause.die(d)`, `Cause.interrupt(fiberId?)`, `Cause.empty`, `Cause.combine(a, b)`, `Cause.fromReasons(reasons)`; `Exit.succeed(a)`, `Exit.fail(e)`, `Exit.die(d)`, `Exit.failCause(c)`, `Exit.interrupt(fiberId?)`.
