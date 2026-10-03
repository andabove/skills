# Running effects

Checked against `effect` 4.0.0 and `@effect/platform-node` 4.0.0. Signatures live in `node_modules/effect/src/Effect.ts` (`run*`) and `node_modules/effect/src/Runtime.ts` (`makeRunMain`, teardown, exit codes).

## The run functions

Each one takes an effect with `R = never` and starts a new root fiber.

| Function | Returns | On a typed failure | On a defect |
| --- | --- | --- | --- |
| `Effect.runPromise(e, options?)` | `Promise<A>` | rejects with the error value itself | rejects with the defect |
| `Effect.runPromiseExit(e, options?)` | `Promise<Exit<A, E>>` | resolves to a failure `Exit` | resolves to a failure `Exit` |
| `Effect.runSync(e)` | `A` | throws the error value itself | throws the defect |
| `Effect.runSyncExit(e)` | `Exit<A, E>` | a failure `Exit` | a failure `Exit` |
| `Effect.runFork(e, options?)` | `Fiber<A, E>` | observe with `Fiber.await` or `Fiber.join` | same |
| `Effect.runCallback(e, { onExit })` | an interrupt function | passed to `onExit` | same |

- `runSync` and `runSyncExit` cannot wait. If the effect does async work, `runSync` throws an `AsyncFiberError` and `runSyncExit` returns a failure whose reason is a `Die`.
- `options` (`RunOptions`) takes `signal`, `scheduler`, `uninterruptible` and `onFiberStart`. An aborted `signal` interrupts the fiber; finalizers run, and `runPromise` rejects with `All fibers interrupted without error`.
- Each `run*` has a `run*With(context)` form, for example `Effect.runPromiseWith(context)(effect)`. Use it when you already hold a `Context<R>`. In v4 there is no `Runtime<R>` value to pass around.
- `Effect.runPromise` does not keep the Node process alive. If the only pending work is a fiber that waits on `Deferred.await` or `Queue.take`, Node exits with code 0 and the fiber never finishes. `runMain` holds the process open until the main fiber ends. (The v4 migration guide `fiber-keep-alive.md` says the core runtime does this; in 4.0.0 only `Runtime.makeRunMain` does.)

## runMain for a process

`NodeRuntime.runMain(effect, options?)` (and `BunRuntime.runMain`) runs the effect as the process's main program:

- It interrupts the main fiber on `SIGINT` and `SIGTERM`. Finalizers run, then the process exits.
- Exit code: `0` on success, `130` when the cause holds only interruptions, otherwise `1`. An error object can set its own code with the `Runtime.errorExitCode` key.
- It logs the cause of a failure with `Effect.logError`. Pass `{ disableErrorReporting: true }` when the app reports errors itself, or set `Runtime.errorReported` to `false` on one error class to skip only that one.
- `{ teardown }` replaces the exit-code logic.

```ts
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Console from "effect/Console"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Runtime from "effect/Runtime"

class UsageError extends Data.TaggedError("UsageError")<{ readonly message: string }> {
  readonly [Runtime.errorExitCode] = 2
  readonly [Runtime.errorReported] = false
}

const main = Effect.gen(function*() {
  yield* Effect.addFinalizer(() => Console.log("closing"))
  const [, , command] = process.argv
  if (command === undefined) return yield* new UsageError({ message: "usage: tool <command>" })
  yield* Console.log(`running ${command}`)
}).pipe(Effect.scoped)

NodeRuntime.runMain(main)
```

A program built from layers (an HTTP server plus workers) runs with `NodeRuntime.runMain(Layer.launch(appLayer))`. `Layer.launch` builds the layer and keeps it alive until interruption (see `effect-services`).

## Signals and finalizers without runMain

`Effect.runPromise(program)` in a Node process installs no signal handler. On `SIGINT` the process ends and finalizers do not run. Use `runMain` for anything that holds resources: connections, files, child processes, servers.

## Inside frameworks

A framework that owns the entry point (an HTTP framework, a queue consumer, a UI) calls your code many times. Build a `ManagedRuntime` once from the app layer, call `runtime.runPromise(effect)` in each handler, and call `runtime.dispose()` on shutdown. The details belong to `effect-services`.

## Interrupting a background fiber

```ts
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Schedule from "effect/Schedule"

const heartbeat = Console.log("alive").pipe(Effect.repeat(Schedule.spaced("1 second")))

const fiber = Effect.runFork(heartbeat)

process.once("SIGUSR2", () => {
  Effect.runFork(Fiber.interrupt(fiber))
})
```

Fibers, forking inside Effect code and interruption rules belong to `effect-concurrency`.
