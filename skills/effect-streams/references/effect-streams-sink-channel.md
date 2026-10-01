# Sinks, channels and encodings

Reference for [effect-streams](../SKILL.md). Checked against `effect@4.0.0`.

## Sink

`Sink<A, In, L, E, R>` consumes `In` values and ends with a result `A`. `L` is the type of leftovers: values it pulled but did not use. It may fail with `E` and needs `R`.

- `Stream.run(stream, sink)` runs the stream into the sink and returns `Effect<A, E, R>`. Leftovers are dropped.
- A sink that is done stops pulling. `Stream.run(endless, Sink.take(2))` pulls two values.

### Constructors

| Sink | Result | Leftovers |
| --- | --- | --- |
| `Sink.collect()` | `Array<In>` | none |
| `Sink.take(n)` | `Array<In>` of the first `n` | the rest of the last chunk |
| `Sink.head()`, `Sink.last()` | `Option<In>` | `head`: the rest of the chunk |
| `Sink.find(predicate)` | `Option<In>` | the rest of the chunk |
| `Sink.takeWhile(p)`, `Sink.takeUntil(p)` and the `Effect` variants | `Array<In>` | the rest |
| `Sink.count`, `Sink.sum` | `number` | none |
| `Sink.every(p)`, `Sink.some(p)` | `boolean` | the rest |
| `Sink.reduce(() => s, f)`, `Sink.reduceEffect`, `Sink.reduceArray` | `S` | none |
| `Sink.reduceWhile(() => s, continue, f)` and variants | `S`; stops when `continue(s)` is false | the rest |
| `Sink.fold(() => s, continue, (s, in) => Effect<S>)`, `Sink.foldArray` | `S` | the rest |
| `Sink.foldUntil(() => s, max, f)` | `S` after `max` inputs | the rest |
| `Sink.forEach(f)`, `Sink.forEachArray(f)`, `Sink.forEachWhile(f)` | `void` | `forEachWhile`: the rest |
| `Sink.drain` | `void` | none |
| `Sink.timed` | `Duration` of the whole run | none |
| `Sink.succeed(a)`, `Sink.fail(e)`, `Sink.die`, `Sink.fromEffect(effect)` | Do not consume input | |
| `Sink.fromQueue(queue)` | Offers each value to a `Queue<A, Cause.Done>` and ends the queue at the end | |
| `Sink.fromPubSub(pubsub)` | Publishes each value | |
| `Sink.fromWritableStream({ evaluate, onError })` | Writes to a web `WritableStream` | |
| `Sink.unwrap(effect)`, `Sink.suspend(() => sink)` | Build a sink with an effect | |

The initial state of `reduce`, `fold` and their variants is a thunk, `() => 0`, as for `Stream.runFold` and `Stream.scan`.

### Operators

| Operator | Changes |
| --- | --- |
| `Sink.map(f)`, `Sink.mapEffect(f)`, `Sink.as(value)` | The result. |
| `Sink.mapInput(f)`, `Sink.mapInputEffect`, `Sink.mapInputArray` | The input type. |
| `Sink.mapError`, `Sink.orElse(f)`, `Sink.catchCause` | The error. |
| `Sink.mapEnd(([a, leftover]) => [a2, leftover2])` | The result and leftovers together. Use it to put leftovers into the result. |
| `Sink.mapLeftover(f)`, `Sink.ignoreLeftover` | The leftovers. |
| `Sink.flatMap((a) => sink)` | Runs another sink after this one, starting with the leftovers. |
| `Sink.withDuration`, `Sink.summarized(effect, f)` | Adds timing or a before/after summary to the result. |
| `Sink.ensuring`, `Sink.onExit`, `Sink.provideService`, `Sink.provideContext` | Lifecycle and services. |

### Run a sink repeatedly

`Stream.transduce(sink)` runs the sink, emits its result, and starts it again on the rest of the stream. `Stream.aggregate(sink)` does the same with the producer and the sink in separate fibers; `Stream.aggregateWithin(sink, schedule)` also flushes on a schedule.

When the input ends exactly at a sink boundary, `transduce` emits one more result from an empty run. Measured: `Stream.range(1, 6).pipe(Stream.transduce(Sink.take(3)))` emits `[1, 2, 3]`, `[4, 5, 6]`, `[]`. Drop it with `Stream.filter((batch) => batch.length > 0)`, or use `Stream.grouped(n)` for fixed-size batches.

```ts
import { Effect, Sink, Stream } from "effect"

// Batches whose total weight stays under a limit.
const underWeight = (limit: number) =>
  Sink.fold(
    () => ({ items: [] as Array<number>, weight: 0 }),
    (state) => state.weight < limit,
    (state, item: number) => Effect.succeed({ items: [...state.items, item], weight: state.weight + item })
  ).pipe(Sink.map((state) => state.items))

export const batches = Stream.make(4, 3, 5, 1, 2, 6).pipe(
  Stream.transduce(underWeight(8)),
  Stream.filter((batch) => batch.length > 0),
  Stream.runCollect
)
```

## Channel

`Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>` reads input elements, writes output elements, may fail, and ends with a done value. A `Stream<A, E, R>` wraps a `Channel<NonEmptyReadonlyArray<A>, E, void, unknown, unknown, unknown, R>` (`stream.channel`); a `Sink` is built from a transform over an upstream pull.

You meet channels when an encoding module returns one. Plug it into a stream with `Stream.pipeThroughChannel(channel)`; the channel's input type is the stream's chunk type and its output becomes the new stream. `Stream.pipeThroughChannelOrFail` keeps the stream's own error type separate. Write a new channel (`Channel.fromTransform`, `Channel.fromPull`) only for a reusable operator that `Stream` does not already provide. `ChannelSchema.decode`, `ChannelSchema.encode` and their `Unknown` variants turn a schema into a channel over chunks.

## Encoding modules (`effect/encoding`)

| Module | Channels |
| --- | --- |
| `Ndjson` | `decode()` (bytes), `decodeString()` (strings), `decodeSchema(schema)()`, `decodeSchemaString(schema)()`; `encode()`, `encodeString()`, `encodeSchema(schema)()`, `encodeSchemaString(schema)()`; `duplex*` for both directions. Options: `{ ignoreEmptyLines: true }`. Errors: `NdjsonError` with `kind: "Pack" \| "Unpack"`, and `SchemaError` for schema variants. |
| `Sse` | `decode()` to `Event` values (`event`, `data`, `id`), `decodeSchema(EventCodec)`, `decodeDataSchema(schema)` (JSON-decodes `data`), `encode()`, `encodeSchema`. A `retry:` field fails the stream with a `Retry` value. |
| `SchemaBinary` | A compact binary codec derived from a schema, with stream `encode` and `decode` channels. |

Both `Ndjson` and `Sse` are marked `@stability unstable` in 4.0.0.

A decoding channel fails a whole chunk at once. Measured with a schema that rejects the third line: when all three lines arrive in one chunk, no row is emitted; when each line is its own chunk, the first two rows are emitted before the failure. To keep the good records, split lines yourself and decode each one:

```ts
import { Effect, Schema, Stream } from "effect"

const Row = Schema.Struct({ id: Schema.Number })
const decodeRow = Schema.decodeUnknownEffect(Row)

export const rows = (text: Stream.Stream<string>) =>
  text.pipe(
    Stream.splitLines,
    Stream.filter((line) => line.length > 0),
    Stream.mapEffect((line) =>
      Effect.try({ try: (): unknown => JSON.parse(line), catch: (cause) => cause }).pipe(
        Effect.flatMap((json) => decodeRow(json)),
        Effect.result
      )
    )
  )
```

Each element of `rows` is a `Result`: the stream goes on after a bad line, and the consumer decides what to do with each failure.

### Platform streams

- Node: `NodeStream.fromReadable({ evaluate: () => readable, onError })`, `NodeStream.toReadable(stream)`, `NodeStream.fromDuplex`, `NodeStream.pipeThroughDuplex` from `@effect/platform-node`.
- Web: `Stream.fromReadableStream({ evaluate, onError })`, `Stream.toReadableStream(stream)`, `Sink.fromWritableStream`.
- HTTP bodies, files, sockets and child processes expose streams through their own modules. See [effect-services](skill:effect-services) for the platform layers.
