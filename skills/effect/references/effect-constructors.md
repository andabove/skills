# Creating effects

Checked against `effect` 4.0.0. Signatures live in `node_modules/effect/src/Effect.ts`.

## Pick the constructor by how the code fails

The question is not "sync or async" but "what happens when it goes wrong":

- It cannot go wrong: `Effect.succeed`, `Effect.sync`, `Effect.promise`. A throw or a rejection inside `sync` or `promise` is a defect: a bug, not part of `E`.
- It can go wrong, and the caller must decide what to do: `Effect.try`, `Effect.tryPromise`, `Effect.callback`, `Effect.fail`. Map the failure to a tagged error in `catch`.

```ts
import { Effect, Schema } from "effect"

class ConfigUnreadable extends Schema.TaggedError<ConfigUnreadable>()("ConfigUnreadable", {
  path: Schema.String,
  cause: Schema.Defect()
}) {}

export const parseConfig = (path: string, text: string) =>
  Effect.try({
    try: (): unknown => JSON.parse(text),
    catch: (cause) => new ConfigUnreadable({ path, cause })
  })

export const fetchJson = (url: string) =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, { signal })
      return (await response.json()) as unknown
    },
    catch: (cause) => new ConfigUnreadable({ path: url, cause })
  })
```

- `Schema.Defect()` keeps an `unknown` cause in a schema error and still encodes it.
- Decode the `unknown` result with `Schema` (see `effect-schema`) instead of casting it.

## The full set

| Constructor | Result | Notes |
| --- | --- | --- |
| `Effect.succeed(a)` | `Effect<A>` | `a` is evaluated once, when the effect is built |
| `Effect.fail(e)` | `Effect<never, E>` | |
| `Effect.failSync(() => e)` | `Effect<never, E>` | builds the error on each run |
| `Effect.die(defect)` | `Effect<never>` | a defect; pass an `Error` with a useful message |
| `Effect.void` | `Effect<void>` | |
| `Effect.never` | `Effect<never>` | never completes; useful in tests and with `timeout` |
| `Effect.sync(() => a)` | `Effect<A>` | a throw is a defect |
| `Effect.try(() => a)` | `Effect<A, Cause.UnknownError>` | the thrown value is in `error.cause` |
| `Effect.try({ try, catch })` | `Effect<A, E>` | |
| `Effect.promise((signal) => p)` | `Effect<A>` | a rejection is a defect |
| `Effect.tryPromise((signal) => p)` | `Effect<A, Cause.UnknownError>` | the rejection is in `error.cause` |
| `Effect.tryPromise({ try, catch })` | `Effect<A, E>` | |
| `Effect.callback<A, E>((resume, signal) => cleanup?)` | `Effect<A, E>` | see below |
| `Effect.suspend(() => effect)` | that effect | builds the effect on each run |
| `Effect.fromNullishOr(a)` | `Effect<NonNullable<A>, Cause.NoSuchElementError>` | |
| `Effect.fromOption(option)` | `Effect<A, Cause.NoSuchElementError>` | |
| `Effect.fromResult(result)` | `Effect<A, E>` | |
| `Effect.sleep("1 second")` | `Effect<void>` | takes a `Duration.Input` |

## Wrap a callback API

`Effect.callback` gives you `resume` and an `AbortSignal`.

- Call `resume` once, with `Effect.succeed(value)` or `Effect.fail(error)`. Later calls are ignored.
- Return an effect to run on interruption, or listen to `signal`. Both fire when the fiber is interrupted, for example by `Effect.timeout`.
- Give the type parameters: TypeScript cannot infer `A` and `E` from the calls to `resume`.

```ts
import { Effect } from "effect"
import { readFile } from "node:fs"

export const readText = (path: string) =>
  Effect.callback<string, NodeJS.ErrnoException>((resume, signal) => {
    readFile(path, { encoding: "utf8", signal }, (error, data) => {
      resume(error ? Effect.fail(error) : Effect.succeed(data))
    })
  })

export const delayed = Effect.callback<number>((resume) => {
  const timer = setTimeout(() => resume(Effect.succeed(1)), 1000)
  return Effect.sync(() => clearTimeout(timer))
})
```

## Use Effect.suspend for three cases

- **A fresh value on each run.** `Effect.succeed(counter++)` runs `counter++` once; `Effect.suspend(() => Effect.succeed(counter++))` runs it on each run.
- **Recursion.** Wrap the recursive call in `Effect.suspend`, so that building the effect does not recurse eagerly.
- **One return type for branches.** A function that returns `Effect.fail(...)` on one branch and `Effect.succeed(...)` on another infers a union of two effect types. Wrap the body in `Effect.suspend`, or annotate the return type.

```ts
import { Effect } from "effect"

export const countDown = (n: number): Effect.Effect<number> =>
  n <= 0 ? Effect.succeed(0) : Effect.suspend(() => countDown(n - 1))

export const divide = (a: number, b: number) =>
  Effect.suspend(() => (b === 0 ? Effect.fail("division by zero" as const) : Effect.succeed(a / b)))
```

## Yieldable values

Inside `Effect.gen`, `yield*` works on an `Effect`, on a tagged error instance (it fails with that error), on a `Context.Service` class (it reads the service), and on a `Config` (it reads the config). It does not work on `Option` or `Result` in 4.0.0: the code does not type check, and at runtime the fiber dies with `Not a valid effect`. Convert them with `Effect.fromOption` and `Effect.fromResult`.

`Ref`, `Deferred` and `Fiber` are plain values in v4. Read them with `Ref.get`, `Deferred.await` and `Fiber.join` (see `effect-concurrency`).
