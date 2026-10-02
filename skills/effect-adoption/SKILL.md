---
name: effect-adoption
description: Adopting Effect in an existing Promise codebase one module at a time. Use when you migrate an async module to Effect, decide whether a module is worth migrating, put an Effect program behind a plain async function, or review such a migration.
---

# Adopting Effect one module at a time

Move one module at a time. Each migrated module keeps its exported async function, so the change stays inside the module and you can revert it alone. The tests move first and do not change during the rewrite. A deliberate break of the new code then proves that the tests can see each behaviour.

Checked against `effect 4.0.0`. When the project has a newer version, read `node_modules/effect/src/<Module>.ts` and `node_modules/effect/AGENTS.md` before you trust a name here.

## Decide first: where Effect pays

| Module shape | Gain |
|---|---|
| One SDK call, and the SDK already has a retry, a timeout and an abort | Little. In a real migration of five server modules, modules like this grew by 18 to 45 percent in lines. |
| Its own retry policy, parallel calls, a concurrency limit, or resources that need cleanup | The most. Effect replaces hand-written loops, timers and `finally` blocks. |

Judge adoption for the codebase, not for each module alone. A team adopts Effect for one pattern everywhere: typed errors, one way to retry and time out, cancel that reaches every call, cleanup that always runs. If the team adopts that pattern, a thin module moves too, and its growth is the known price. If the team does not, migrate only the modules that gain the most.

## Steps

Do the steps in order. Each step ends on its done line.

1. **Measure before.** Record the four [measures](#measure) for the module. Done when you have four numbers from the old code.
2. **Move the tests to the edge.** Point the tests at the function that production calls, through its public signature. Reach its dependencies through the seams it already has, such as a client parameter, so the signature does not change. Write an abort test that checks the call's own signal (see [cancel](#cancel-reaches-the-call)). Commit the tests while they pass on the old code. Run them on the old code several times, for example five, before you claim they pass: one passing run can hide a flaky test (in one migration, a test committed as passing failed about 2 runs in 5). Done when the commit is made and every test passes on the old code in every run.
3. **Rewrite inside the module.** Write the Effect program and the [edge](#the-edge-a-plain-async-function). Change no test file. Done when the unchanged tests pass and `tsc` passes.
4. **Break it on purpose.** Make each break below, run the tests, and revert. Done when each break fails at least one test:
   - drop the signal from the underlying call,
   - change the retry count,
   - retry or catch the wrong fault (for example, retry a 404),
   - remove the already-aborted guard at the edge.

   A break that no test catches is a missing test. Add the test, confirm it fails on the break and passes on the old code, then continue.
5. **Measure after.** Record the four measures again and report both sets. Done when the report holds before and after numbers for each measure.

## The edge: a plain async function

The Effect program stays inside the module. The exported function keeps the old signature, runs the program, and maps the `Exit` back to a value or a thrown error. Callers and tests see no Effect type.

```ts
import * as Cause from "effect/Cause"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Schedule from "effect/Schedule"

interface Invoice {
  readonly id: string
  readonly total: number
}
interface InvoiceClient {
  get(id: string, options: { readonly signal: AbortSignal }): Promise<Invoice>
}
declare const isTransient: (error: unknown) => boolean

export class InvoiceLoadError extends Data.TaggedError("InvoiceLoadError")<{
  readonly message: string
  readonly cause: unknown
}> {}

const load = (client: InvoiceClient, id: string) =>
  Effect.tryPromise({
    try: (signal) => client.get(id, { signal }),
    catch: (cause) => new InvoiceLoadError({ message: `could not load invoice ${id}`, cause })
  }).pipe(
    Effect.retry({
      times: 2,
      schedule: Schedule.spaced("100 millis"),
      while: (error) => isTransient(error.cause)
    })
  )

export async function loadInvoice(
  client: InvoiceClient,
  id: string,
  options: { readonly signal?: AbortSignal } = {}
): Promise<Invoice> {
  options.signal?.throwIfAborted()
  const exit = await Effect.runPromiseExit(load(client, id), { signal: options.signal })
  if (Exit.isSuccess(exit)) return exit.value
  if (Cause.hasInterruptsOnly(exit.cause) && options.signal?.aborted) throw options.signal.reason
  throw Cause.squash(exit.cause)
}
```

- **Run with `Effect.runPromiseExit(program, { signal })`.** The signal interrupts the fiber when the caller aborts. `runPromiseExit` never rejects, so the edge decides what to throw.
- **Tell a cancel from a fault with `Cause.hasInterruptsOnly(exit.cause)`.** It is `true` only when every reason is an interrupt. Throw the signal's `reason`, so the caller gets back the value it passed to `abort()`.
- **Throw `Cause.squash(exit.cause)` for a fault.** It gives the typed error for a failure and the thrown value for a defect: one error to log. It drops the other reasons in the cause; use `Cause.pretty` when the log needs them all.
- **Keep the error contract the tests assert.** Here the old code threw `InvoiceLoadError` with the fault as `cause`. The tagged error keeps the same `name`, `message` and `cause`, so the old assertions still pass.
- **Keep the program unexported** until a caller also moves to Effect. Then that caller can import the program and compose it, and the edge stays for the remaining Promise callers.
- **Build a layer once, not per call.** When the program needs services, build them once with `ManagedRuntime.make(layer)` at module level and call `runtime.runPromiseExit(program, { signal })`. `Effect.provide(layer)` inside the edge builds the layer again on every call. See `skill:effect-services`.
- **Give that runtime an owner that disposes it.** The runtime holds its resources until `await runtime.dispose()` runs: no release happens before it. Name the code that owns the runtime, and call `dispose()` in the application's shutdown hook and in test teardown (`afterAll`). A run started after `dispose()` fails.

The full module before and after, with its test file and the four breaks, is in [references/effect-adoption-worked-example.md](references/effect-adoption-worked-example.md).

## Cancel reaches the call

Pass the signal that `Effect.tryPromise` gives the thunk to the underlying call: `try: (signal) => client.get(id, { signal })`. When the fiber is interrupted, `runPromiseExit` returns at once and does not wait for the call. A call that did not get the signal runs on to the end, and the code still compiles.

- **Assert the call's own signal in every abort test.** A fake that records the `signal` it receives lets the test check `recorded.aborted === true`. A test that checks only the rejection passes with the signal dropped, because the edge returns at once either way.
- **Declare the parameter in the thunk itself.** Effect makes the `AbortController` only when the thunk's `length` is above 0. A thunk written as `(...args) =>` or `(signal = fallback) =>` has length 0 and gets no fiber signal, though its type says `AbortSignal`.
- **Use `Effect.promise((signal) => ...)` the same way** for a call that cannot reject.

## A signal that is already aborted

`runPromiseExit` runs the program up to its first async step (or until the runtime yields, after a long run of sync steps) and only then reads the signal. So with a signal that is already aborted:

- a program that starts with the call starts the call, with a signal that is not yet aborted, then aborts it;
- a program with sync steps first runs them, then starts the call the same way;
- a program with an async step before the call does not start the call;
- a program with no async step completes and returns its value.

Do not promise that no call starts. If the old function guaranteed it, keep the guard `options.signal?.throwIfAborted()` at the top of the edge, as in the example, and keep a test for it.

## Errors keep their cause

Wrap each fault in a `Data.TaggedError` with a `cause` field that holds the original fault. `Data.TaggedError` passes `cause` and `message` to the native `Error` constructor, so `error.cause` is the original fault, and log sanitisers and error reporters that walk the `cause` chain still name the real fault.

- Give the error a `message` field. Without one, `error.message` is the empty string.
- The error's `name` is its tag, so assertions on `name` keep working when the tag is the old class name.
- Name the field `cause`. Only that name reaches the native `Error.cause` that reporters walk.

For tagged errors, `catchTag`, and retry policy as error handling, see `skill:effect-errors`.

## A shared route edge

When many routes run programs, one helper is the edge for all of them: it runs the program on the runtime with the request's signal and maps each end to a response.

- **A route's own answers travel with its program.** A route that answers a close or a fault in its own way (its own code and message) gets those answers from the module that builds the program, in one value with the program. The edge takes only that value, so a route cannot drop an answer, and each test that runs the program through the edge reads the same answers. Answers passed as extra arguments of the edge can be left out, and no test fails.

```ts
import * as Effect from "effect/Effect"

interface Answer {
  readonly status: number
  readonly code: string
}

export interface AnsweredProgram<A, R> {
  readonly program: Effect.Effect<A, unknown, R>
  readonly closed: Answer
  readonly fault: Answer
}

// A route with no answers of its own says so.
export const plainRoute = <A, R>(program: Effect.Effect<A, unknown, R>): AnsweredProgram<A, R> => ({
  program,
  closed: { status: 499, code: "request/aborted" },
  fault: { status: 500, code: "server/fault" }
})

// The edge takes only an AnsweredProgram: a bare program does not compile here.
export declare function runRoute<A, R>(route: AnsweredProgram<A, R>, signal: AbortSignal): Promise<Response>
```

- **An answer that must survive a close runs with no signal.** A signal that fires after the program's first suspension ends the run interrupted, even after an uninterruptible write (see `skill:effect-concurrency`). Such a route runs with no interrupting signal and reads the close as a value.
- **A route that answers with a stream.** The edge covers the program until it returns, and the stream outlives it, so the edge's signal and error mapping do not reach the work that the stream drives. Give that work a runner that carries the request's signal, so a close stops the calls the stream drives. Run the save that must survive a close with no signal. Run both through the runtime, so its `dispose()` reaches them. No edge answers a fault after the first byte: the work logs its own faults. A Nitro example is in `skill:effect-services` (its frameworks reference).

## Import from subpaths

Import each module from its subpath, `effect/Effect`, not from the `effect` index. The index re-exports every module, and Node loads all of them at startup. In a Node server built with `tsc` and run unbundled, the index cost 200 to 250 ms of cold import time, against 60 to 70 ms for five subpaths.

```ts
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"
import * as TestClock from "effect/testing/TestClock"
```

Import test modules by module too: `effect/testing` is itself a small index, and it loads 130 modules against 68 for `effect/testing/TestClock`.

Ban the index with ESLint's `no-restricted-imports`. The rule matches the exact name `effect`, so every subpath passes. It also flags `import type` from the index; write type imports from subpaths too.

```js
// eslint.config.js
export default [
  {
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "effect",
          message: "Import the module subpath, such as effect/Effect: the index loads every module at startup."
        }]
      }]
    }
  }
]
```

## Keep programs at the edge with a lint rule

When the edge exists, a lint rule refuses a call that runs a program outside the edge files, so no module grows an edge of its own again. A rule that matches only `Effect.runPromise(...)` is easy to get around without meaning to. Make it cover each row below, and give each row a case in the rule's tests:

| Way around the rule | Example |
|---|---|
| A re-export | `export { runPromise } from "effect/Effect"`, `export * from "effect/Effect"` |
| A renamed import | `import { runPromise as run } from "effect/Effect"` |
| Destructuring, with a string or template key | `const { runPromise } = Effect`, `const { ["runPromise"]: run } = Effect` |
| A member with a string or template key | `Effect["runPromise"](program)` |
| The edge's own run helpers | a module that imports the route edge or one of its runners and calls it outside a route |
| A path matched without an anchor | an exemption for `route.ts` that also exempts `src/other/route.ts`. Anchor each path at the package root, and pin the list of edge files as a set in the tests. |
| A broad test exemption | `**/*test*` also exempts `testing.ts` and `latest.ts`. Exempt the tests by the test runner's own globs. |
| A run name that is less known | the list below |

The names that run a program in effect 4.0.0, beyond `Effect.run*` and `Effect.run*With`:

- the `run*` methods of a `ManagedRuntime`: restrict the import of `effect/ManagedRuntime` to the module that makes the runtime;
- `Runtime.makeRunMain`, and `runMain` of `@effect/platform-node/NodeRuntime` and `@effect/platform-bun/BunRuntime`;
- `Stream.toReadableStream`, `Stream.toReadableStreamWith`, `Stream.toAsyncIterable` and `Stream.toAsyncIterableWith`, which run the stream when it is read;
- `toWebHandler`, `toWebHandlerWith`, `toWebHandlerLayer` and `toWebHandlerLayerWith` of `effect/http/HttpEffect`, and `toWebHandler` of `effect/http/HttpRouter`;
- `makeRuntime`, `makeRuntimePromise`, `runtime` and `runtimePromise` of `FiberSet`, `FiberMap` and `FiberHandle`, which give a run function to callbacks.

A key that only run-time code builds, such as `Effect["run" + name]`, is out of reach of a static rule. Say so in the rule's doc comment, and keep "a program runs only at an edge" in review.

## Measure

Take each measure on the old code and on the new code, with the same command:

- **Lines**: `wc -l` on the module's source files, without tests.
- **Build size**: the size of the server build output (for example `du -sb dist`), or of the bundle if the server is bundled.
- **Cold import time**: import the built module in a fresh Node process, 10 or more times, and take the median: `node --input-type=module -e 'const t = performance.now(); await import("./dist/invoice.js"); console.log(performance.now() - t)'`.
- **Tests**: the number of tests, how many pass, and the run time.

Report a number that got worse as plainly as one that got better. Growth in lines is expected for thin modules. The first migrated module adds Effect's own load time; a jump near the index cost above points to an index import.

## Related skills

- `skill:effect` - the core, running at the edge, house style.
- `skill:effect-errors` - tagged errors, `Cause`, `Exit`, retries and timeouts.
- `skill:effect-testing` - tests through the plain edge, and `@effect/vitest` for Effect code.
- `skill:effect-services` - layers and `ManagedRuntime` for programs that need services.
- `skill:effect-concurrency` - parallel calls, limits and interruption.
