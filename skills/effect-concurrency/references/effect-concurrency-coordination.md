# Coordination primitives and shared state

Reference for [effect-concurrency](../SKILL.md). Checked against `effect@4.0.0`. Every constructor returns an `Effect`; create the value inside the program (or a layer) and pass it to the fibers that share it.

## Deferred

A value that one fiber sets once and any number of fibers await.

- `Deferred.make<A, E>()`, then `Deferred.await(d)` suspends until it completes.
- Complete with `Deferred.succeed`, `Deferred.fail`, `Deferred.die`, `Deferred.failCause`, `Deferred.done(d, exit)`, `Deferred.interrupt`, or `Deferred.complete(d, effect)` (runs the effect once and stores its outcome). Each returns `Effect<boolean>`: `true` for the first completion, `false` after.
- `Deferred.completeWith(d, effect)` stores the effect itself, and every waiter runs it. Prefer `complete`.
- `effect.pipe(Deferred.into(d))` runs `effect` and completes `d` with its outcome, including failure and interruption. `Deferred.poll` and `Deferred.isDone` check without waiting.

```ts
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"

export const handOff = Effect.gen(function*() {
  const ready = yield* Deferred.make<string>()
  const consumer = yield* Effect.forkChild(Deferred.await(ready))
  yield* Deferred.succeed(ready, "config loaded")
  return yield* Fiber.join(consumer)
})
```

## Latch

A gate. `Latch.make(open?)` starts closed by default.

| Member | Effect |
| --- | --- |
| `latch.await` | Waits until the latch is open. |
| `latch.whenOpen(effect)` | Waits, then runs `effect`. |
| `latch.open` / `latch.close` | Opens for every current and future waiter / closes for future waiters. |
| `latch.release` | On a closed latch, lets the current waiters through and stays closed. On an open latch, does nothing and returns `false`. It never closes a latch; use `close` for that. |

Use a latch to hold requests until startup finishes. Use a `Semaphore` with one permit for mutual exclusion.

## Semaphore

`Semaphore.make(permits)` returns an `Effect<Semaphore>`.

| Member | Effect |
| --- | --- |
| `sem.withPermits(n)(effect)`, `sem.withPermit(effect)` | Waits for permits, runs `effect`, returns the permits on success, failure and interruption. |
| `sem.withPermitsIfAvailable(n)(effect)` | Runs only if the permits are free now. Returns `Option`. |
| `sem.take(n)`, `sem.release(n)`, `sem.releaseAll` | Manual control. Pair `take` with `release` in `Effect.acquireRelease`. |
| `sem.resize(n)` | Changes the total. |

The module functions (`Semaphore.withPermits(sem, n)`) do the same. `PartitionedSemaphore` shares permits fairly between keys.

## Queue

A `Queue<A, E = never>` hands each value to one taker in offer order.

| Constructor | When full |
| --- | --- |
| `Queue.bounded<A>(n)` | `offer` suspends until there is room (back-pressure). |
| `Queue.dropping<A>(n)` | `offer` returns `false` and drops the new value. |
| `Queue.sliding<A>(n)` | Drops the oldest value to make room. |
| `Queue.unbounded<A>()` | Never full. Grows without limit. |

| Operation | Behaviour |
| --- | --- |
| `Queue.offer(q, a)` | Returns `Effect<boolean>`: `false` when the value was dropped or the queue is done. |
| `Queue.offerAll(q, values)` | Returns `Effect<Array<A>>`: the values the queue did not accept. `[]` means all were accepted. Measured: `offerAll` of `[1, 2, 3, 4]` on `dropping(2)` returns `[3, 4]`. Test `rejected.length`, not the array, because `[]` is truthy. |
| `Queue.offerUnsafe(q, a)` | Synchronous offer for callbacks outside Effect. |
| `Queue.take` | Waits for one value. |
| `Queue.takeAll` | Waits for at least one value, then takes every buffered value. It does not return an empty array. |
| `Queue.takeN(q, n)` | Takes up to `n` values. It waits for `n`, or for `capacity` values when `n` is larger than the queue's capacity. |
| `Queue.takeBetween(q, min, max)` | Waits for `min` (or `capacity`, if smaller), takes up to `max`. |
| `Queue.poll`, `Queue.clear` | Do not wait. `poll` returns an `Option`; `clear` returns the buffered values, possibly none. |
| `Queue.size`, `Queue.isFull` | Read the state. |

`takeN` and `takeBetween` return short batches in two cases. Measured: on an open `bounded(2)` queue, `takeN(q, 5)` returned `[1, 2]`; on an ended queue that held one value, `takeN(q, 3)` and `takeBetween(q, 3, 5)` returned `[1]`. When you need exactly `n`, check `batch.length` or accumulate across takes.

### Completion

A queue that can end carries `Cause.Done` in its error type: `Queue.bounded<A, Cause.Done>(n)` or `Queue.Queue<A, E | Cause.Done>`. The completion functions need that type.

| Function | Buffered values | Waiting takers | Later `take` |
| --- | --- | --- | --- |
| `Queue.end(q)` | Kept; takers drain them | Get the remaining values, then `Done` | Fails with `Cause.Done` |
| `Queue.fail(q, e)` / `Queue.failCause` | Kept | Drain, then the failure | Fails with `e` |
| `Queue.interrupt(q)` | Kept | Drain, then an interruption | Interrupted |
| `Queue.shutdown(q)` | Dropped | Interrupted at once | Interrupted |

- `Queue.collect(q)` takes every value until the queue ends.
- `Queue.await(q)` waits until the queue is done. It succeeds after `end` and is interrupted after `shutdown`; use `Fiber.await` or `Effect.onExit` when you need to observe both.
- `Stream.fromQueue(q)` ends the stream when the queue ends. `Stream.callback` gives you a queue that already has this type.

### Read-only and write-only views

`Queue.Enqueue<A, E>` allows only offers and completion; `Queue.Dequeue<A, E>` allows only takes. A `Queue` is both. Type a producer's parameter as `Enqueue` and a consumer's as `Dequeue`. `Queue.asEnqueue` and `Queue.asDequeue` narrow the type only.

```ts
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"

const produce = Effect.fnUntraced(function*(queue: Queue.Enqueue<number, Cause.Done>) {
  yield* Queue.offerAll(queue, [1, 2, 3])
  yield* Queue.end(queue)
})

export const pipeline = Effect.gen(function*() {
  const queue = yield* Queue.bounded<number, Cause.Done>(16)
  yield* Effect.forkChild(produce(queue))
  return yield* Queue.collect(queue)
})
```

## PubSub

A `PubSub<A>` gives every published value to every current subscriber.

- `PubSub.bounded<A>(n)` applies back-pressure when the slowest subscriber is `n` behind. `PubSub.dropping`, `PubSub.sliding` and `PubSub.unbounded` behave as for `Queue`. Each accepts `{ capacity, replay }` (`unbounded` takes `{ replay }`).
- `PubSub.subscribe(pubsub)` returns a `Subscription` and requires `Scope`. The subscription ends when the scope closes. Read it with `PubSub.take`, `PubSub.takeAll`, `PubSub.takeUpTo`, `PubSub.takeBetween`.
- A subscriber receives only values published after it subscribed. Subscribe first, or set `replay: n` so late subscribers get the last `n` values.
- `PubSub.publish` returns `false` when a dropping hub drops the value. `PubSub.publishAll` publishes many.
- `Stream.fromPubSub(pubsub)` is a stream that subscribes when it runs. Expose that from an event-bus service instead of the hub.
- Close the hub with `PubSub.shutdown` in a finalizer (`Effect.addFinalizer(() => PubSub.shutdown(hub))`).

## Ref

`Ref.make(initial)` returns an `Effect<Ref<A>>`.

| Function | Returns |
| --- | --- |
| `Ref.get`, `Ref.set` | The value / `void`. |
| `Ref.update(ref, f)`, `Ref.updateAndGet`, `Ref.getAndUpdate` | `void` / new value / old value. |
| `Ref.modify(ref, (a) => [result, next])` | `result`, and stores `next`, in one step. |
| `Ref.updateSome(ref, (a) => Option<A>)` | `void`. Stores the value when the function returns `Option.some(next)`; keeps the state on `Option.none()`. |
| `Ref.modifySome(ref, (a) => [result, Option<A>])` | `result`. The function returns a tuple; the second item is `Option.some(next)` to store `next`, or `Option.none()` to keep the state. |

Each function is atomic. A read, a yield and a write are not: 100 concurrent fibers that `get`, yield, then `set` left a counter at 1, while 100 `Ref.update` calls left it at 100.

Provide a `Ref` to many parts of the program through a service built with `Layer.effect(MyState, Ref.make(initial))` or `Effect.provideServiceEffect`.

## SynchronizedRef

The same API as `Ref`, plus effectful updates that run one at a time: `SynchronizedRef.updateEffect`, `modifyEffect`, `getAndUpdateEffect`, `updateAndGetEffect`, `updateSomeEffect`. Use it when the next state depends on an effect, such as a lookup. Other updates wait while the effect runs.

## SubscriptionRef

The `SynchronizedRef` API plus `SubscriptionRef.changes(ref)`, a `Stream<A>` that emits the current value first and then every change. Each run of the stream is a new subscriber. Use it for state that a UI or another fiber watches.

```ts
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import * as SubscriptionRef from "effect/SubscriptionRef"

export const watchStatus = Effect.gen(function*() {
  const status = yield* SubscriptionRef.make<"idle" | "busy">("idle")
  const watcher = SubscriptionRef.changes(status).pipe(
    Stream.takeUntil((value) => value === "busy"),
    Stream.runCollect
  )
  const [seen] = yield* Effect.all(
    [watcher, Effect.sleep("10 millis").pipe(Effect.andThen(SubscriptionRef.set(status, "busy")))],
    { concurrency: "unbounded" }
  )
  return seen
})
```

## Transactional variants

`TxRef`, `TxQueue`, `TxPubSub`, `TxSemaphore`, `TxHashMap` and the other `Tx*` modules run several reads and writes as one transaction with `Effect.tx`. Reach for them only when a single `Ref.modify` cannot hold the whole update. Read `node_modules/effect/src/TxRef.ts` before you use them.
