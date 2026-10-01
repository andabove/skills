---
name: effect-streams
description: Effect Stream, Sink and Channel. Use when an Effect program produces or consumes many values over time - building a Stream from an iterable, callback, queue, PubSub, async iterable or Node or web stream; transforming, merging, batching or throttling it; running it to a result or into a Sink; tying resources or error recovery to it; or decoding text, NDJSON or SSE through a Channel.
---

# Effect streams

Checked against `effect@4.0.0`. When the project has a newer version, check each API you use in `node_modules/effect/src/Stream.ts`, `Sink.ts` or `Channel.ts`, and read `node_modules/effect/AGENTS.md` first. The source wins over this skill.

## The model

- A `Stream<A, E, R>` describes a source of zero or more `A` values that may fail with `E` and needs services `R`. Nothing runs until a `Stream.run*` function turns it into an `Effect`.
- Each run starts the stream over. Two `runCollect` calls on the same stream pull the source twice.
- Streams are pull-based: the consumer asks for the next values. `Stream.take(2)` stops pulling after two values, so an endless source is fine.
- Values move in chunks (non-empty arrays). `Stream.make(1, 2, 3)` and `Stream.fromIterable(array)` emit one chunk. Operators that work per chunk (`throttle` cost, decoding channels, `rechunk`) see chunks, not elements.
- A `Sink` consumes a stream into one result. A `Channel` is the primitive under both. Write application code with `Stream` and `Sink`; use a `Channel` when an encoding module hands you one.

## Create a stream

| Source | Constructor |
| --- | --- |
| Values, an iterable, a range | `Stream.make(...)`, `Stream.fromIterable`, `Stream.fromArray`, `Stream.range(min, max)` (inclusive), `Stream.iterate`, `Stream.empty` |
| One effect, or an effect that yields an iterable | `Stream.fromEffect`, `Stream.fromIterableEffect` |
| An effect run again and again | `Stream.fromEffectRepeat`, `Stream.fromEffectSchedule(effect, schedule)` |
| A cursor or page API | `Stream.paginate(start, (cursor) => Effect<[items, Option<next>]>)` |
| State machine | `Stream.unfold(start, (s) => Effect<[value, next] \| undefined>)` |
| Time | `Stream.tick(interval)` (first tick at once), `Stream.fromSchedule(schedule)` |
| A callback or event API | `Stream.callback`, `Stream.fromEventListener(target, type)` |
| A queue or hub | `Stream.fromQueue(queue)`, `Stream.fromPubSub(pubsub)`, `SubscriptionRef.changes(ref)` |
| `AsyncIterable`, web `ReadableStream`, Node `Readable` | `Stream.fromAsyncIterable(it, onError)`, `Stream.fromReadableStream({ evaluate, onError })`, `NodeStream.fromReadable({ evaluate, onError })` from `@effect/platform-node` |
| A stream built by an effect | `Stream.unwrap(effect)` |

### Wrap a callback API with `Stream.callback`

`Stream.callback` gives you a `Queue` and runs your setup effect in a scope that closes when the stream ends, fails or is interrupted. Register the listener with `Effect.acquireRelease` so the release removes it.

```ts
import { Effect, Queue, Stream } from "effect"

interface Ticker {
  on(listener: (price: number) => void): void
  off(listener: (price: number) => void): void
}

export const prices = (ticker: Ticker) =>
  Stream.callback<number>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const listener = (price: number) => Queue.offerUnsafe(queue, price)
        ticker.on(listener)
        return listener
      }),
      // Runs when the consumer stops, for example after Stream.take.
      (listener) => Effect.sync(() => ticker.off(listener))
    )
  )
```

- `Queue.offerUnsafe(queue, a)` emits. `Queue.endUnsafe(queue)` (or `Queue.end`) ends the stream. `Queue.failCauseUnsafe` or `Queue.fail` fails it.
- The queue is unbounded by default. `{ bufferSize, strategy }` bounds it. `Queue.offerUnsafe` cannot wait: on a full queue it returns `false` and drops the value, unless the strategy is `"sliding"`, which drops the oldest.
- The setup effect runs in its own fiber, so it may loop. A pull-based source can `yield* Queue.offer(queue, a)` there to wait for room (back-pressure).

## Run a stream

| Function | Result |
| --- | --- |
| `Stream.runCollect` | `Array<A>` (a plain array) |
| `Stream.runDrain` | `void`; runs for side effects |
| `Stream.runForEach(f)`, `Stream.runForEachWhile(f)` | `void`; `f` returns an effect. For `While` it returns `Effect<boolean>`, and the stream stops after the first `false`. |
| `Stream.runFold(() => initial, f)` | The folded value. The initial state is a thunk. |
| `Stream.runHead`, `Stream.runLast` | `Option<A>` |
| `Stream.runCount`, `Stream.runSum`, `Stream.mkString` | A number or a string |
| `Stream.run(sink)` | The sink's result |
| `Stream.toPull` | A pull effect that fails with `Cause.Done` at the end. Requires `Scope`. |
| `Stream.toAsyncIterable`, `Stream.toReadableStream` | For non-Effect consumers. Leaving a `for await` loop early runs the stream's finalizers. |
| `Stream.runIntoQueue`, `Stream.runIntoPubSub`, `Stream.toQueue`, `Stream.toPubSub` | Feed other fibers |

## Transform

- `Stream.map`, `Stream.filter`, `Stream.tap`, `Stream.take`, `Stream.takeWhile`, `Stream.takeUntil` (keeps the matching element), `Stream.drop`, `Stream.changes`, `Stream.zipWithIndex`.
- `Stream.mapEffect(f, { concurrency })` keeps input order. Add `unordered: true` to emit in completion order.
- `Stream.flatMap(f, { concurrency })` merges inner streams; without `concurrency` it runs them one after another. `Stream.switchMap(f)` interrupts the running inner stream when a new value arrives.
- `Stream.scan(() => initial, f)` emits each running state, starting with the initial one. `Stream.mapAccum(() => initial, (s, a) => [next, outputs])` emits zero or more values per input.
- Batching: `Stream.grouped(n)`, `Stream.groupedWithin(n, duration)`, `Stream.rechunk(n)`, `Stream.transduce(sink)`.
- Timing: `Stream.schedule(schedule)` spaces elements, `Stream.debounce(d)` keeps the last value after a pause, `Stream.throttle({ cost, units, duration, strategy })` limits rate per chunk.
- Combining: `Stream.concat` (one after the other), `Stream.merge(a, b, { haltStrategy })` (interleave as values arrive; `"both"` by default), `Stream.mergeAll(streams, { concurrency })`, `Stream.zip` (pairs, ends with the shorter), `Stream.zipLatest`, `Stream.interleave`.
- Back-pressure: `Stream.buffer({ capacity, strategy })` lets the producer run ahead of a slow consumer.
- Stopping: `Stream.interruptWhen(effect)` stops when `effect` completes. `Stream.haltWhen(effect)` stops after the current element.

The full operator catalogue with signatures is in [effect-streams-operators.md](references/effect-streams-operators.md).

## Errors

- A failure ends the stream. Values already emitted stay emitted: `runForEach` has processed them, `runCollect` discards them and fails.
- Recover with `Stream.catch(f)`, `Stream.catchTag`, `Stream.catchTags`, `Stream.catchCause`, `Stream.orElseSucceed`. The replacement stream continues after the values already emitted.
- `Stream.retry(schedule)` reruns the whole stream from the start, so the consumer sees the first values again. Measured: `1, 2` then a failure twice, then `3`, gives `[1, 2, 1, 2, 1, 2, 3]`. Retry the effect inside the stream (`Stream.mapEffect((a) => call(a).pipe(Effect.retry(policy)))`) when only that step should run again.
- `Stream.timeout(d)` ends the stream quietly when no value arrives within `d`. Use `Stream.timeoutOrElse({ duration, orElse })` to fail or switch instead.
- `Stream.tapError`, `Stream.onError` and `Stream.onExit` observe without recovering.
- Decoding channels fail a whole chunk: when one line of an NDJSON chunk is invalid, the valid lines in the same chunk are not emitted. Decode per element with `Stream.mapEffect` and `Schema.decodeUnknownEffect` when each record must succeed or fail on its own.

## Resources

- Acquire a resource for the life of a stream with `Stream.scoped(Stream.fromEffect(Effect.acquireRelease(acquire, release)))`, then `Stream.flatMap` over it. The release runs when the stream ends, before the `run*` effect returns.
- Without `Stream.scoped`, `Scope` stays in the stream's requirements, and the resource is released only when the outer scope closes.
- `Stream.callback` and `Stream.unwrap` remove `Scope` themselves.
- `Stream.ensuring(finalizer)` runs after the stream's own finalizers, on success, failure and interruption.

```ts
import { Effect, Stream } from "effect"

interface Cursor {
  readonly rows: Effect.Effect<ReadonlyArray<string>>
  readonly close: Effect.Effect<void>
}
declare const openCursor: (query: string) => Effect.Effect<Cursor>

export const rows = (query: string) =>
  Stream.scoped(Stream.fromEffect(Effect.acquireRelease(openCursor(query), (cursor) => cursor.close))).pipe(
    Stream.flatMap((cursor) => Stream.fromIterableEffect(cursor.rows))
  )
```

## Share one source

- `Stream.broadcast(stream, { capacity })` and `Stream.share(stream, { capacity })` return an `Effect<Stream>` that needs `Scope`. Every consumer of the returned stream sees every value. The slowest consumer sets the pace when the buffer fills.
- `Stream.fromPubSub(pubsub)` gives each run its own subscription. Messages published before the run starts are missed unless the hub has `replay`.

## Sinks

- `Stream.run(stream, sink)` consumes until the sink is done. `Sink.take(n)`, `Sink.head()`, `Sink.takeWhile` stop early and stop pulling the stream.
- Common sinks: `Sink.collect()`, `Sink.count`, `Sink.sum`, `Sink.forEach(f)`, `Sink.reduce(() => initial, f)`, `Sink.fold(() => initial, continue, f)`, `Sink.drain`, `Sink.timed`.
- `Stream.transduce(sink)` runs the sink again and again and emits each result. With `Sink.take(n)` on a stream whose length is a multiple of `n`, the last result is an empty array.
- Adapt a sink with `Sink.mapInput` (input) and `Sink.map` (result).

Sink constructors, leftovers, channels and the encoding modules are in [effect-streams-sink-channel.md](references/effect-streams-sink-channel.md).

## Text, NDJSON and SSE

- Bytes to lines: `stream.pipe(Stream.decodeText, Stream.splitLines)`. Back to bytes: `Stream.encodeText`.
- NDJSON: `Stream.pipeThroughChannel(Ndjson.decodeSchemaString(MySchema)())` from `effect/encoding`. Parse errors fail with `NdjsonError` (`kind: "Unpack"`); schema errors fail with `SchemaError`. Encode with `Ndjson.encodeString()` or `Ndjson.encodeSchemaString(MySchema)()`.
- SSE: `Sse.decode()` and `Sse.encode()` from `effect/encoding`. A `retry:` line fails the stream with a `Retry` value that holds the delay; events in the same chunk are lost. Catch it with `Stream.catchTag("Retry", ...)` and reconnect after `retry.duration`.
- `Ndjson` and `Sse` are marked `@stability unstable` in 4.0.0. Pin the version and recheck on upgrade.

## Related skills

- [effect](skill:effect) for the core and running effects.
- [effect-concurrency](skill:effect-concurrency) for `Queue`, `PubSub`, fibers, interruption and `Schedule`.
- [effect-errors](skill:effect-errors) for typed errors, `Cause` and `catchTag`.
- [effect-schema](skill:effect-schema) for the schemas that decode stream records.
- [effect-services](skill:effect-services) for `Scope`, `Layer` and the platform modules.
