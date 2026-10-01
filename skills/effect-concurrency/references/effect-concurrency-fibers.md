# Fibers, interruption and fiber collections

Reference for [effect-concurrency](../SKILL.md). Checked against `effect@4.0.0`.

## Fork variants

All fork functions return `Effect<Fiber<A, E>, never, R>` and take `{ startImmediately?: boolean, uninterruptible?: boolean | "inherit" }`.

| Function | Owner | Ends when | Typical use |
| --- | --- | --- | --- |
| `Effect.forkChild(effect)` | The fiber that forks | It completes, or the owner fiber ends | Short-lived concurrent work that you join or interrupt in the same fiber. |
| `Effect.forkScoped(effect)` | The `Scope` in context | It completes, or that scope closes | Background work for the life of a service, a layer or an `Effect.scoped` block. |
| `Effect.forkIn(effect, scope)` | The given `Scope` | It completes, or that scope closes | Background work whose lifetime is a scope you hold, not the current one. |
| `Effect.forkDetach(effect)` | No one | It completes or is interrupted | Rare. A fiber that must outlive every scope. Keep the `Fiber` and interrupt it on shutdown. |

```ts
import { Effect, Schedule } from "effect"

declare const refreshCache: Effect.Effect<void>

// The refresher runs until the surrounding scope (a layer, a request, a test) closes.
export const startRefresher = Effect.forkScoped(
  refreshCache.pipe(Effect.repeat(Schedule.spaced("1 minute")))
)
```

### The owner of a `forkChild` fiber is a fiber

The child of `forkChild` lives as long as the fiber that ran `forkChild`. A function such as `Effect.fn("start")(function*() { yield* Effect.forkChild(job) })` returns at once, and `job` keeps running until the caller's fiber ends. In a server or a layer that fiber may run for the life of the process. Choose one:

- Run the block as its own fiber: `Effect.forkChild(block)` and join it. Children of `block` end with it.
- Use `Effect.scoped` around the block and `Effect.forkScoped` inside it.
- Keep the `Fiber` and `Fiber.interrupt` it before the block returns.

### When a forked fiber starts

A forked fiber starts after the current fiber yields (at the next async step or `Effect.yieldNow`). Code after `forkChild` runs first. When the child must be running before the next line, for example a subscriber that must exist before you publish, pass `{ startImmediately: true }` or wait on a `Deferred` that the child completes when it is ready.

## The Fiber API

| Function | Returns | Notes |
| --- | --- | --- |
| `Fiber.join(fiber)` | `Effect<A, E>` | Re-raises the fiber's failure or interruption in the joiner. |
| `Fiber.await(fiber)` | `Effect<Exit<A, E>>` | Never fails. Use it to inspect the outcome. |
| `Fiber.interrupt(fiber)` | `Effect<void>` | Resumes after the fiber's finalizers finish. Fork it to continue without waiting. |
| `Fiber.joinAll(fibers)`, `Fiber.awaitAll(fibers)`, `Fiber.interruptAll(fibers)` | | The same for many fibers. |
| `fiber.interruptUnsafe()` | `void` | Synchronous request. Does not wait. For callbacks outside Effect. |
| `fiber.pollUnsafe()` | `Exit \| undefined` | Synchronous peek at a finished fiber. |

Fibers do not combine directly. Join each one and combine the effects, for example `Effect.zip(Fiber.join(a), Fiber.join(b))`.

`Effect.awaitAllChildren(effect)` makes `effect` complete only after every child it forked with `forkChild` has finished. Children that existed before it started are not awaited.

## Interruption rules

- A fiber is interrupted from outside. It stops at the next interruptible point, then runs its finalizers in reverse order of registration.
- The effect that requested the interruption (`Fiber.interrupt`, `Effect.timeout`, a race, `Effect.all` after a failure, a closing scope) resumes only after those finalizers finish.
- `Effect.onInterrupt(cleanup)` runs only on interruption. `Effect.ensuring(finalizer)` runs on every exit. `Effect.onExit(f)` sees the `Exit`.
- `Effect.uninterruptible(effect)` defers interruption until `effect` ends. `Effect.uninterruptibleMask((restore) => ...)` defers it except inside `restore(...)`. `Effect.interruptible` reopens a region.
- `Effect.timeout` on an uninterruptible effect returns only when the effect ends, and still fails with `TimeoutError`. Measured: a 300 ms uninterruptible task under a 100 ms timeout returned after 300 ms with `TimeoutError`.
- A program run with `Effect.runPromise(effect, { signal })` or `Effect.runPromiseExit(effect, { signal })` is interrupted when the signal aborts. The returned Promise settles when the fiber's finalizers finish.

## Cancellation of foreign calls

| Constructor | On interruption |
| --- | --- |
| `Effect.tryPromise({ try: (signal) => ..., catch })` | Aborts `signal` and ends the fiber at once. The Promise is not awaited. |
| `Effect.promise((signal) => ...)` | The same. A rejection becomes a defect. |
| `Effect.callback((resume, signal) => cleanup)` | Aborts `signal` (when declared) and runs the returned `cleanup` effect. The fiber ends after `cleanup` completes. |
| `Effect.abortSignal` | Gives a signal that aborts when the current `Scope` closes. Requires `Scope`. |

Effect creates the `AbortController` only when the function you pass declares the parameter (`function.length` is not zero). Write `(signal) => call({ signal })`.

## Fiber collections

Each collection is created in a `Scope` and interrupts its fibers when that scope closes. A finished fiber leaves the collection by itself.

| Module | Holds | `run` behaviour |
| --- | --- | --- |
| `FiberSet` | Any number of fibers | `FiberSet.run(set, effect)` adds a fiber. |
| `FiberMap` | One fiber per key | `FiberMap.run(map, key, effect)` interrupts the fiber already under `key`, unless `{ onlyIfMissing: true }`. |
| `FiberHandle` | At most one fiber | `FiberHandle.run(handle, effect)` interrupts the current fiber, unless `{ onlyIfMissing: true }`. |

```ts
import { Context, Effect, FiberMap, Layer } from "effect"

declare const syncTenant: (tenantId: string) => Effect.Effect<void>

export class TenantSync extends Context.Service<TenantSync, {
  start(tenantId: string): Effect.Effect<void>
}>()("app/TenantSync") {
  static readonly layer = Layer.effect(
    TenantSync,
    Effect.gen(function*() {
      // Closing the layer's scope interrupts every running sync.
      const running = yield* FiberMap.make<string>()
      return TenantSync.of({
        // A second start for the same tenant restarts its sync.
        start: (tenantId) => Effect.asVoid(FiberMap.run(running, tenantId, syncTenant(tenantId)))
      })
    })
  )
}
```

`FiberMap.run` and `FiberHandle.run` start the new fiber without waiting for the old one to stop: measured, a replacement started while the old fiber's 20 ms finalizer was still running. When two copies must never overlap, call `FiberMap.remove(map, key)` (or `FiberHandle.clear(handle)`) first; it returns after the old fiber's finalizers finish.

`FiberSet.join(set)` fails with the first failure of any fiber in the set. `FiberSet.awaitEmpty(set)` waits until the set is empty. `FiberSet.makeRuntime` and `FiberSet.makeRuntimePromise` return a function that runs effects from non-Effect callbacks into the set.
