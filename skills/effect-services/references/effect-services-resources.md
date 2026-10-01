# Resources and Scope in depth

Reference for [effect-services](../SKILL.md). Checked against `effect 4.0.0`; the source is `node_modules/effect/src/Scope.ts` and the resource section of `Effect.ts`.

## The model

A `Scope` is a lifetime with a list of finalizers. Closing the scope runs its finalizers in reverse order of registration, once. An effect that registers a finalizer has `Scope` in its requirements until something supplies the scope:

| Who closes the scope | When |
| --- | --- |
| `Effect.scoped(effect)` | when `effect` ends |
| a layer built by `Effect.provide`, `ManagedRuntime` or `Layer.launch` | when the provided effect ends, at `runtime.dispose()`, or when the launched program is interrupted |
| `Scope.close(scope, exit)` on a scope from `Scope.make()` | when you call it |

## acquireRelease

```ts
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"

interface Lock { readonly id: string }
declare const takeLock: (name: string) => Promise<Lock>
declare const freeLock: (lock: Lock) => Promise<void>

// Effect<Lock, never, Scope>
export const lock = (name: string) =>
  Effect.acquireRelease(
    Effect.promise(() => takeLock(name)),
    (lock, exit) =>
      Effect.promise(() => freeLock(lock)).pipe(
        Effect.tap(() => Effect.log(`released ${lock.id} after ${Exit.isSuccess(exit) ? "success" : "failure"}`))
      )
  )

export const job = Effect.scoped(
  Effect.gen(function* () {
    const a = yield* lock("a")
    const b = yield* lock("b")
    yield* Effect.log(`working with ${a.id} and ${b.id}`)
  })
)
// released b, then a
```

- The release runs once when the scope closes: after success, after failure, and after interruption.
- The release receives the scope's `Exit`. Use it to roll back only on failure.
- The acquire step is uninterruptible. An interrupt during acquisition waits for it to finish, then runs the release.
- An acquire step that fails registers no release: nothing was acquired.

## Roll back a sequence on failure

Give each step a release that undoes it only when the scope closes with a failure. If a later step fails, the earlier steps undo in reverse order.

```ts
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"

class StepFailed extends Schema.TaggedError<StepFailed>()("StepFailed", { step: Schema.String }) {}

const step = (name: string, fail: boolean) =>
  Effect.acquireRelease(
    fail ? Effect.fail(new StepFailed({ step: name })) : Effect.succeed(name),
    (created, exit) => Exit.isFailure(exit) ? Effect.log(`undo ${created}`) : Effect.void
  )

export const createWorkspace = Effect.scoped(
  Effect.gen(function* () {
    const bucket = yield* step("bucket", false)
    const index = yield* step("index", false)
    const row = yield* step("row", true)
    return { bucket, index, row }
  })
)
// logs "undo index", then "undo bucket"; fails with StepFailed
```

## Other finalizer helpers

| Helper | Runs |
| --- | --- |
| `Effect.addFinalizer((exit) => effect)` | when the current scope closes; needs `Scope` |
| `Effect.ensuring(finalizer)` | after the effect, on success, failure or interruption; no `Scope` needed |
| `Effect.onExit((exit) => effect)` | after the effect, with its `Exit` |
| `Effect.onError((cause) => effect)` | after a failure or an interruption, not after success |
| `Effect.acquireUseRelease(acquire, use, release)` | acquire, use, then release in one call; no `Scope` in the result |

## Pick the lifetime

- App lifetime (a pool, an HTTP client, a cache): acquire in `Layer.effect`.
- Per request or per job (a transaction, a temp directory, a lock): `Effect.scoped` around that unit.
- One call: `Effect.acquireUseRelease`.
- Per key with idle expiry (a pool per tenant): `LayerMap`, see [effect-services-layers.md](effect-services-layers.md).
- A lifetime that no code block matches: a manual scope.

## Manual scopes

```ts
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Scope from "effect/Scope"

export const program = Effect.gen(function* () {
  const scope = yield* Scope.make()
  yield* Effect.addFinalizer(() => Effect.log("closed first resource")).pipe(Scope.provide(scope))
  yield* Effect.addFinalizer(() => Effect.log("closed second resource")).pipe(Scope.provide(scope))
  // Scope.provide does not close the scope: both resources are still open here
  yield* Scope.close(scope, Exit.void)
  // logged "closed second resource", then "closed first resource"
})
```

Close every scope you make, including on failure paths; prefer `Effect.scoped` whenever a block matches the lifetime.

## Traps

- Returning a resource out of `Effect.scoped` hands out a released value. Keep the use inside the scope, or move the resource into a layer.
- `Effect.provide(effect, layer)`, when no enclosing build already holds that layer, gives the layer's resources the lifetime of `effect`. Provided inside a handler, the pool opens and closes per request.
- A fiber interrupted before it starts runs none of its body, so an `onInterrupt` inside it does not run. Put cleanup on the scope.
