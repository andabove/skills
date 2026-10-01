---
name: effect
description: Effect (the TypeScript library) core and router to the other Effect skills. Use when you write, review or explain code that imports `effect` or `@effect/*`, when you set up a project for Effect, or when you must find which Effect skill or API covers a task.
---

# Effect

Checked against `effect` 4.0.0. When the project has a newer version, check each API in the project's own copy: read `node_modules/effect/src/<Module>.ts` (each export has a doc comment with **When to use** and **Gotchas**) and `node_modules/effect/AGENTS.md`. The installed source wins over this skill and over every website page.

## Pick the skill

This skill holds the core: the `Effect` type, setup and imports, creating effects, `Effect.gen` and `Effect.fn`, pipelines, running at the edge, house style, and where to look an API up. Load the skill that matches the task as well:

| Skill | Reach for it when you |
| --- | --- |
| `effect-errors` | define a tagged error, recover from a failure, read a `Cause` or `Exit`, set a retry or a timeout |
| `effect-concurrency` | run work in parallel, fork or interrupt a fiber, race, use `Deferred`, `Queue`, `PubSub`, `Semaphore`, `Latch`, `Ref`, or a `Schedule` |
| `effect-streams` | produce or consume a `Stream`, or use `Sink`, `Channel` or a stream encoding |
| `effect-services` | define a service with `Context.Service`, build a `Layer`, manage a `Scope` or resource, read `Config`, use `ManagedRuntime` or a platform module |
| `effect-schema` | decode, encode or validate data with `Schema` |
| `effect-data` | use `Option`, `Result`, `Duration`, `DateTime`, `Chunk`, `HashMap`, `Data`, `Equal`, `Order`, a cache or request batching |
| `effect-observability` | add logs, spans or metrics, or export them |
| `effect-testing` | test Effect code with `@effect/vitest`, `TestClock` or test layers |
| `effect-adoption` | bring Effect into a Promise codebase one module at a time |
| `effect-v3-to-v4` | meet Effect 3 code or Effect 3 API names |

An API name that you remember from Effect 3 (`catchAll`, `Either`, `Context.Tag`, `Effect.fork`) is a migration case: load `effect-v3-to-v4` before you write it.

## The Effect type

`Effect<A, E, R>` is a value that describes a program: it succeeds with `A`, fails with an expected error `E`, and needs the services `R`. `E` and `R` default to `never`. Read the parts of an existing effect with `Effect.Success<typeof x>`, `Effect.Error<typeof x>` and `Effect.Services<typeof x>`.

- An effect is lazy. Building it runs nothing; each run runs it again from the start.
- An effect is immutable. Every operator returns a new effect.
- An effect that you build and then drop never runs. Inside a callback, return it or `yield*` it.

## Create effects

| You have | Write | Failure mode |
| --- | --- | --- |
| a value | `Effect.succeed(value)` | none |
| an expected error | `Effect.fail(error)` | typed `E` |
| sync code that cannot throw | `Effect.sync(() => ...)` | a throw becomes a defect |
| sync code that can throw | `Effect.try({ try, catch })` | `catch` maps the throw to `E` |
| a Promise that cannot reject | `Effect.promise((signal) => ...)` | a rejection becomes a defect |
| a Promise that can reject | `Effect.tryPromise({ try: (signal) => ..., catch })` | `catch` maps the rejection to `E` |
| a callback API | `Effect.callback<A, E>((resume, signal) => ...)` | what you pass to `resume` |
| a value that can be `null` or `undefined` | `Effect.fromNullishOr(value)` | `Cause.NoSuchElementError` |
| an `Option` or a `Result` | `Effect.fromOption(o)`, `Effect.fromResult(r)` | `NoSuchElementError`, or the `Result` error |
| an effect to build on each run | `Effect.suspend(() => effect)` | that of the effect |

Traps:

- `Effect.succeed(expr)` evaluates `expr` once, when you build the effect. For a fresh value on each run, use `Effect.sync` or `Effect.suspend`.
- `Effect.try` and `Effect.tryPromise` without `catch` fail with `Cause.UnknownError`, which loses the type of the cause. Pass `catch` and map to a tagged error (see `effect-errors`).
- Pass the `signal` of `promise` and `tryPromise` on to `fetch` and other abortable APIs. Effect aborts it when the fiber is interrupted, for example by a timeout.

More constructors and the callback contract: [references/effect-constructors.md](references/effect-constructors.md).

## Write sequential code with Effect.gen

Use `Effect.gen` for inline code. `yield*` an effect to get its value; the first failure stops the generator.

```ts
import { Data, Effect } from "effect"

class InsufficientFunds extends Data.TaggedError("InsufficientFunds")<{
  readonly balance: number
  readonly message: string
}> {}

declare const readBalance: (account: string) => Effect.Effect<number>

export const program = Effect.gen(function*() {
  const balance = yield* readBalance("acc-1")
  if (balance < 100) {
    return yield* new InsufficientFunds({ balance, message: `balance ${balance} is below 100` })
  }
  return balance - 100
})
```

- Write `return yield*` for every failure. Without `return`, TypeScript does not narrow the code after it.
- Use `if`, `for` and `while` as in plain code.
- Keep `try`/`catch`/`finally` away from `yield*`. In 4.0.0 a `catch` block does not see a failed effect, and a `finally` block does not run when the effect fails, dies or is interrupted. Use `Effect.catch*` operators for recovery and `Effect.ensuring`, `Effect.onExit` or `Effect.acquireRelease` for cleanup.
- To bind `this`, pass it first: `Effect.gen({ self: this }, function*() { ... })`.
- `Option` and `Result` are not yieldable in `Effect.gen` in 4.0.0, despite what the v4 migration guide says. Convert first: `yield* Effect.fromOption(option)`.

## Write reusable functions with Effect.fn

For a function that returns an effect, use `Effect.fn("Name")` with the function's own name. It creates a tracing span with that name when the effect runs, and adds the call site and definition site to `Cause.pretty` output. Use `Effect.fnUntraced` in hot paths and library internals, where a span costs more than it gives. Do not write a plain function that only returns `Effect.gen`.

```ts
import { Effect, Schema } from "effect"

class PriceNotFound extends Schema.TaggedError<PriceNotFound>()("PriceNotFound", {
  sku: Schema.String
}) {}

declare const lookup: (sku: string) => Effect.Effect<number | undefined>

export const priceOf = Effect.fn("priceOf")(
  function*(sku: string): Effect.fn.Return<number, PriceNotFound> {
    const price = yield* lookup(sku)
    if (price === undefined) return yield* new PriceNotFound({ sku })
    return price
  },
  (effect, sku) => Effect.annotateLogs(effect, { sku })
)
```

- Put extra behaviour (`Effect.catchTag`, `Effect.retry`, `Effect.annotateLogs`) in the arguments after the body. Each one receives the effect and the call's arguments, and runs inside the span. A `.pipe` on the call result runs outside the span.
- `Effect.fn.Return<A, E, R>` annotates the generator's return type. Use it to fix the public type of the function, so that a change in the body cannot widen it.
- `Effect.fn` also accepts a body that returns an effect directly: `Effect.fn("parse")((input: string) => Effect.try(...))`. `Effect.fnUntraced` accepts only a generator.
- Calling the function runs nothing. Each run of the returned effect runs the body.

## Build pipelines

`effect.pipe(f, g, h)` is `h(g(f(effect)))`. Most operators are dual: `Effect.map(effect, f)` and `effect.pipe(Effect.map(f))` are the same.

| Operator | Use it to |
| --- | --- |
| `Effect.map(f)` | change the success value with a plain function |
| `Effect.flatMap(f)`, `Effect.andThen(f)` | run the next effect, which depends on the value |
| `Effect.tap(f)` | run an effect for its side effect and keep the value |
| `Effect.as(value)`, `Effect.asVoid` | replace the value |
| `Effect.all(effects, options?)` | combine a tuple, struct or iterable of effects |
| `Effect.forEach(items, f, options?)` | run `f` for each item and collect the results |

- `Effect.all` and `Effect.forEach` run one effect at a time by default. Pass `{ concurrency: n }` or `{ concurrency: "unbounded" }` to run in parallel (see `effect-concurrency`).
- Write callbacks as lambdas: `Effect.map((user) => format(user))`, not `Effect.map(format)`. A point-free callback receives every argument that the operator passes: `Effect.forEach(items, f)` calls `f(item, index)`, so an optional second parameter of `f` silently gets the index.
- Prefer `Effect.gen` over long `pipe` chains and over `Effect.Do` with `Effect.bind`. Keep `pipe` for operators that wrap a whole effect: `Effect.timeout`, `Effect.retry`, `Effect.withSpan`, `Effect.provide`.

## Run effects at the edge

Build the program as one effect and run it once, where the process or the framework hands over control. Inside Effect code, `yield*` an effect; do not run it.

| Entry point | Write |
| --- | --- |
| a Node process (server, worker, CLI) | `NodeRuntime.runMain(program)` from `@effect/platform-node` (Bun: `BunRuntime.runMain` from `@effect/platform-bun`) |
| a long-running app built as layers | `NodeRuntime.runMain(Layer.launch(appLayer))` |
| a framework handler or a callback API | a `ManagedRuntime` built once from the app layer (see `effect-services`) |
| a script or a test that needs the value | `await Effect.runPromise(program)` |
| a value you must handle both ways | `await Effect.runPromiseExit(program)` |
| a background fiber you will interrupt | `Effect.runFork(program)` |
| a sync call site, and the effect is sync | `Effect.runSync(program)` |

- `runMain` keeps the process alive until the program ends, interrupts it on `SIGINT` and `SIGTERM` so that finalizers run, and then exits with code 130. On a failure it logs the cause and exits with code 1. `Effect.runPromise` does none of this: on `SIGINT` the process ends without finalizers, and a program that only waits (on a `Deferred`, a `Queue`) lets Node exit with code 0.
- `Effect.runPromise` rejects with the failure value itself, and `Effect.runSync` throws it. `Effect.runSync` throws `AsyncFiberError` if the effect does any async work.
- `run*` takes an effect with `R = never`. Provide its services first (`Effect.provide`, see `effect-services`), or use `Effect.runPromiseWith(context)` when you hold a `Context`.
- Pass `{ signal }` to `Effect.runPromise` or `Effect.runFork` to interrupt the run from an `AbortController`.

Exit codes, teardown and the other run functions: [references/effect-running.md](references/effect-running.md).

## Set up a project

1. Install `effect`. Pin every `@effect/*` package to the same version as `effect`: in v4 they release together. Install from the `latest` tag; the `rc` tag points to an older pre-release.
2. In `tsconfig.json`, set `"strict": true` and `"exactOptionalPropertyTypes": true`, a `target` of `ES2022` or later, and `"moduleResolution"` of `"NodeNext"` or `"Bundler"`. Under the old `node10` resolution TypeScript cannot resolve `effect` at all; below `ES2015`, `yield*` on an effect does not compile.
3. Add the agent pointer to the project's `AGENTS.md` or `CLAUDE.md`, so that each agent reads the guidance for the installed version.

Full steps, the agent pointer text, and the editor and lint tooling: [references/effect-setup.md](references/effect-setup.md).

## Import modules

Both forms give the same API:

```ts
import { Effect } from "effect"
import * as Console from "effect/Console"

export const program = Effect.andThen(Console.log("ready"), Effect.succeed(1))
```

The `effect` index loads every module. Cold import in Node 24.14, median of 30 fresh processes:

| Import | Modules loaded | Median | p90 |
| --- | --- | --- | --- |
| `effect` (index) | 216 | 222 ms | 260 ms |
| `effect/Effect` | 64 | 65 ms | 88 ms |
| `effect/Effect` + `effect/Layer` + `effect/Context` | 64 | 63 ms | 72 ms |
| `effect/Schema` | 113 | 134 ms | 157 ms |
| `effect/Function` | 2 | 8 ms | 10 ms |

- Where Node loads the code without a bundler (servers, CLIs, serverless functions, tests), import subpaths: `import * as Effect from "effect/Effect"`. It saves about 155 ms of cold start.
- A bundler that does not drop unused modules of the index pays the same cost in size. esbuild 0.28 bundled `Effect.runSync` from the index into 85 KB against 24.5 KB from `effect/Effect`; Rollup 4 gave 21.3 KB for both.
- Follow the style that the project already uses. The examples in these skills import from the index for brevity.

## House style

- Model expected errors as tagged error classes (`Schema.TaggedError` or `Data.TaggedError`), not strings or plain `Error` (see `effect-errors`).
- Put behaviour behind services and layers, not module-level singletons (see `effect-services`).
- Parse every value from outside the process with `Schema`; use the `Predicate` module for runtime type guards (see `effect-schema`).
- Read time through `Clock` or `DateTime`, not `Date.now()`, so that tests can control it (see `effect-data` and `effect-testing`).
- Use `Match` for exhaustive branching on a union, and `Brand` for nominal ids.

More rules with examples: [references/effect-code-style.md](references/effect-code-style.md).

## Look an API up

1. `node_modules/effect/src/<Module>.ts`: the signature and the doc comment for the installed version.
2. `node_modules/effect/AGENTS.md` and `node_modules/effect/ai-docs/src/`: the maintainers' agent guidance and examples for that version.
3. The v4 website, `https://effect.website/docs/v4/...`: add `.md` to any page URL for its Markdown copy.

Code and docs written for Effect 3, or for a v4 beta, use names that 4.0.0 does not have. Check each name in step 1 before you use it.

## Learn in order

Each step builds on the one before it. Teach or read in this order:

1. The `Effect` type: success, error, requirements, laziness (this skill).
2. Setup: install and `tsconfig` (this skill).
3. Creating effects, `Effect.gen`, `Effect.fn`, and running at the edge (this skill).
4. Expected errors and defects, fallbacks, retries (`effect-errors`).
5. Concurrency: bounded parallel work, racing, interruption (`effect-concurrency`).

Then branch by need: services and layers (`effect-services`), data (`effect-schema`, `effect-data`), streams (`effect-streams`), observability (`effect-observability`), tests (`effect-testing`).
