---
name: effect-streams
description: Effect Stream, Sink and Channel. Use when an Effect program produces or consumes many values over time - building a Stream from an iterable, callback, queue, PubSub, async iterable or Node or web stream; transforming, merging, batching or throttling it; running it to a result or into a Sink; tying resources or error recovery to it; or decoding text, NDJSON or SSE through a Channel.
---

# Effect streams

Checked against `effect@4.0.0`. When the project has a newer version, check each API you use in `node_modules/effect/src/Stream.ts`, `Sink.ts` or `Channel.ts`, and read `node_modules/effect/AGENTS.md` first. The source wins over this skill.

## The model

- A `Stream<A, E, R>` describes a source of zero or more `A` values that may fail with `E` and needs services `R`. Nothing runs until a `Stream.run*` function turns it into an `Effect`.
- Each run evaluates the pipeline again, but it does not rewind external state. Measured: a stream over one generator object gives `[1, 2]`, then `[]` on the second run; a stream over an ended queue gives `[1, 2]`, then `[]`. Build the source inside the run, `Stream.suspend(() => Stream.fromIterable(makeIterator()))`, when each run must start from the beginning.
- Streams are pull-based: the consumer asks for the next chunk. `Stream.take(2)` emits two values and pulls no further chunk, so an endless source is fine. But the source produces whole chunks: measured, `Stream.take(2)` and `Sink.take(2)` over an endless iterator made the iterator yield 4096 values (the default chunk size) and emitted `[1, 2]`. When reading the source has a cost or a side effect, set a small chunk, `Stream.fromIterable(it, { chunkSize: 1 })` (measured: 2 values read). Operators downstream of the source still see only the values that `take` lets through.
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
| `AsyncIterable`, web `ReadableStream`, Node `Readable` | `Stream.fromAsyncIterable(it, onError)`, `Stream.fromReadableStream({ evaluate, onError })`, `NodeStream.fromReadable({ evaluate, onError })` from `@effect/platform-node/NodeStream` |
| A stream built by an effect | `Stream.unwrap(effect)` |

### Wrap a callback API with `Stream.callback`

`Stream.callback` gives you a `Queue` and runs your setup effect in a scope that closes when the stream ends, fails or is interrupted. Register the listener with `Effect.acquireRelease` so the release removes it.

```ts
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"

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
- Stopping: `Stream.interruptWhen(effect)` and `Stream.haltWhen(effect)` stop the stream when `effect` completes, but only between chunks: a chunk that was already pulled is still delivered. Measured: halting while the consumer handled `1` of a one-chunk `Stream.make(1, 2, 3)` still delivered `[1, 2, 3]`; after `Stream.rechunk(1)` it delivered `[1]`. For an element-level stop, use `Stream.rechunk(1)` before it, or check the condition in the consumer (`Stream.takeWhile`, `Stream.runForEachWhile`).

The full operator catalogue with signatures is in [effect-streams-operators.md](references/effect-streams-operators.md).

## Errors

- A failure ends the stream. Values already emitted stay emitted: `runForEach` has processed them, `runCollect` discards them and fails.
- Recover with `Stream.catch(f)`, `Stream.catchTag`, `Stream.catchTags`, `Stream.catchCause`, `Stream.orElseSucceed`. The replacement stream continues after the values already emitted.
- `Stream.retry(schedule)` reruns the whole stream from the start, so the consumer sees the first values again. A rerun repeats acquisition and the pipeline; it does not give back what an external source already handed out (a consumed queue, a live subscription, an iterator). Measured: `1, 2` then a failure twice, then `3`, gives `[1, 2, 1, 2, 1, 2, 3]`. Retry the effect inside the stream (`Stream.mapEffect((a) => call(a).pipe(Effect.retry(policy)))`) when only that step should run again.
- `Stream.timeout(d)` ends the stream quietly when no value arrives within `d`. Use `Stream.timeoutOrElse({ duration, orElse })` to fail or switch instead.
- `Stream.tapError`, `Stream.onError` and `Stream.onExit` observe without recovering.
- Decoding channels fail a whole chunk: when one line of an NDJSON chunk is invalid, the valid lines in the same chunk are not emitted. Decode per element with `Stream.mapEffect` and `Schema.decodeUnknownEffect` when each record must succeed or fail on its own.

## Resources

- Acquire a resource for the life of a stream with `Stream.scoped(Stream.fromEffect(Effect.acquireRelease(acquire, release)))`, then `Stream.flatMap` over it. The release runs when the stream ends, before the `run*` effect returns.
- Without `Stream.scoped`, `Scope` stays in the stream's requirements, and the resource is released only when the outer scope closes.
- `Stream.callback` removes `Scope` itself. `Stream.unwrap(effect)` removes `Scope` only from the effect that builds the stream; a `Scope` that the built stream needs stays. Measured: `Stream.unwrap(Effect.succeed(streamThatNeedsScope))` run without a scope fails with `Service not found: effect/Scope`; wrapped in `Stream.scoped` it runs.
- `Stream.ensuring(finalizer)` runs after the stream's own finalizers, on success, failure and interruption.

```ts
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"

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

- `Stream.broadcast(stream, { capacity })` and `Stream.share(stream, { capacity })` return an `Effect<Stream>` that needs `Scope`. A consumer of the returned stream receives the values produced while it is subscribed, not the ones before.
- `broadcast` starts the source when the effect runs. Measured: a consumer that subscribed after the source finished received `[]`. Fork every consumer with `{ startImmediately: true }` right after `broadcast`, or set `replay: n`.
- `share` starts the source when the first consumer runs. Measured: a consumer that joined after the first value received only `[2]`; with `replay: 1` it received `[1, 2]`.
- With the default `strategy: "suspend"`, a full buffer makes the source wait for the slowest consumer. With `"dropping"` or `"sliding"` the source does not wait, and a slow consumer misses values (measured: 3 of 10).
- `Stream.fromPubSub(pubsub)` gives each run its own subscription. Messages published before the run starts are missed unless the hub has `replay`.

## Sinks

- `Stream.run(stream, sink)` consumes until the sink is done. `Sink.take(n)`, `Sink.head()`, `Sink.takeWhile` stop early and pull no further chunk; the chunk they stop in was already produced in full.
- Common sinks: `Sink.collect()`, `Sink.count`, `Sink.sum`, `Sink.forEach(f)`, `Sink.reduce(() => initial, f)`, `Sink.fold(() => initial, continue, f)`, `Sink.drain`, `Sink.timed`.
- `Stream.transduce(sink)` runs the sink again and again and emits each result. With `Sink.take(n)` on a stream whose length is a multiple of `n`, the last result is an empty array.
- Adapt a sink with `Sink.mapInput` (input) and `Sink.map` (result).

Sink constructors, leftovers, channels and the encoding modules are in [effect-streams-sink-channel.md](references/effect-streams-sink-channel.md).

## Text, NDJSON and SSE

- Bytes to lines: `stream.pipe(Stream.decodeText, Stream.splitLines)`. Back to bytes: `Stream.encodeText`.
- NDJSON: `Stream.pipeThroughChannel(Ndjson.decodeSchemaString(MySchema)())` with `import * as Ndjson from "effect/encoding/Ndjson"`. Parse errors fail with `NdjsonError` (`kind: "Unpack"`); schema errors fail with `SchemaError`. Encode with `Ndjson.encodeString()` or `Ndjson.encodeSchemaString(MySchema)()`.
- SSE: `Sse.decode()` and `Sse.encode()` from `effect/encoding/Sse`. A `retry:` line fails the stream with a `Retry` value that holds the delay. The decoder first emits the complete events it has parsed (measured: an event, a `retry:` line and an event in one string delivered both events to `runForEach`, then failed with `Retry`); `runCollect` still returns only the failure. Catch it with `Stream.catchTag("Retry", ...)` and reconnect after `retry.duration`.
- `Ndjson` and `Sse` are marked `@stability unstable` in 4.0.0. Pin the version and recheck on upgrade.

## Related skills

- [effect](skill:effect) for the core and running effects.
- [effect-concurrency](skill:effect-concurrency) for `Queue`, `PubSub`, fibers, interruption and `Schedule`.
- [effect-errors](skill:effect-errors) for typed errors, `Cause` and `catchTag`.
- [effect-schema](skill:effect-schema) for the schemas that decode stream records.
- [effect-services](skill:effect-services) for `Scope`, `Layer` and the platform modules.
