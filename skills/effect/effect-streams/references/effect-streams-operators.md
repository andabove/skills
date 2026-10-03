# Stream operator catalogue

Reference for [effect-streams](../SKILL.md). Checked against `effect@4.0.0`. Every operator below is exported from `effect/Stream`; most are dual (`Stream.map(stream, f)` or `stream.pipe(Stream.map(f))`). Read the signature in `node_modules/effect/src/Stream.ts` before you rely on an option.

## Constructors

| Operator | Notes |
| --- | --- |
| `make(...values)`, `succeed(a)`, `sync(() => a)`, `empty`, `never` | `make` and `fromIterable` of an array emit a single chunk. |
| `fromIterable(it, { chunkSize })`, `fromArray`, `fromArrays(...arrays)` | |
| `range(min, max, chunkSize?)` | Inclusive of both ends. Default chunk size 4096. |
| `iterate(start, next)` | Endless. Bound it with `take`. |
| `unfold(s, (s) => Effect<readonly [A, S] \| undefined>)` | `undefined` ends the stream. |
| `paginate(s, (s) => Effect<readonly [ReadonlyArray<A>, Option<S>]>)` | `Option.none()` ends after emitting the page. |
| `fromEffect`, `fromEffectDrain`, `fromIterableEffect`, `fromIterableEffectRepeat`, `fromEffectRepeat` | `fromEffectRepeat` ends when the effect fails with `Cause.Done` (`Cause.done()`). |
| `fromEffectSchedule(effect, schedule)`, `fromSchedule(schedule)`, `tick(interval)` | `tick` emits its first value at once. |
| `fail`, `failSync`, `failCause`, `die` | |
| `callback(f, { bufferSize, strategy })`, `fromEventListener(target, type, options)` | `f` receives a `Queue<A, E \| Cause.Done>` and runs in its own fiber with a `Scope`. |
| `fromQueue(dequeue)`, `fromPubSub(pubsub)`, `fromPubSubTake`, `fromSubscription(subscription)` | `fromQueue` ends when the queue ends. |
| `fromAsyncIterable(it, onError)`, `fromReadableStream({ evaluate, onError, releaseLockOnEnd })` | `onError` maps a thrown value to `E`. |
| `fromPull`, `fromChannel`, `toChannel` | Low level. |
| `unwrap(effect)`, `suspend(() => stream)`, `scoped(stream)`, `service(Tag)`, `serviceOption` | `scoped(stream)` removes `Scope` from the stream. `unwrap(effect)` removes `Scope` only from `effect`; a `Scope` that the built stream needs stays. `suspend` builds the source again on each run. |

## Mapping and filtering

| Operator | Notes |
| --- | --- |
| `map(f)`, `as(value)`, `mapArray(f)` | `f` receives the element and its index. `mapArray` works per chunk. |
| `mapEffect(f, { concurrency, unordered })`, `mapArrayEffect`, `flattenEffect` | Ordered output unless `unordered: true`. |
| `tap(f)`, `tapBoth({ onElement, onError })`, `tapSink(sink)` | |
| `filter(predicate)`, `filterEffect`, `filterMap(filter)`, `filterMapEffect` | `filterMap` takes a `Filter` from `effect/Filter` (`Filter.fromPredicate`, `Filter.make`). |
| `mapAccum(() => s, (s, a) => [s, outputs], { onHalt })`, `mapAccumEffect` | Emits zero or more outputs per input. |
| `scan(() => s, f)`, `scanEffect` | Emits the initial state, then each state. |
| `changes`, `changesWith(eq)`, `changesWithEffect` | Drops consecutive duplicates. |
| `zipWithIndex`, `zipWithNext`, `zipWithPrevious`, `zipWithPreviousAndNext` | Neighbours come as `Option`. |
| `intersperse(sep)`, `intersperseAffixes({ start, middle, end })` | |
| `flatten`, `flattenIterable`, `flattenArray`, `flattenTake` | |

## Taking and dropping

`take(n)`, `takeRight(n)`, `takeWhile`, `takeWhileEffect`, `takeUntil(p, { excludeLast })` (keeps the matching element unless `excludeLast`), `takeUntilEffect`, `drop`, `dropRight`, `dropWhile`, `dropUntil`, `limitBytes`.

## Flat-mapping and combining

| Operator | Notes |
| --- | --- |
| `flatMap(f, { concurrency, bufferSize })` | Sequential by default: each inner stream runs to its end. |
| `switchMap(f)` | Interrupts the running inner stream when the outer emits. |
| `concat(that)`, `prepend(values)` | `that` starts after the first ends. |
| `merge(that, { haltStrategy })`, `mergeAll(streams, { concurrency })` | `haltStrategy`: `"both"` (default), `"either"`, `"left"`, `"right"`. |
| `mergeLeft`, `mergeRight`, `mergeResult`, `mergeEffect(effect)` | `mergeEffect` runs an effect for the life of the stream. |
| `drainFork(other)` | Runs `other` in the background; fails if it fails. |
| `zip`, `zipWith`, `zipLeft`, `zipRight`, `zipFlatten` | Ends with the shorter stream. |
| `zipLatest`, `zipLatestWith`, `zipLatestAll` | Emits with the latest value of each side once each side has emitted. |
| `cross`, `crossWith` | Runs the right stream again for each left element. |
| `interleave`, `interleaveWith(that, decider)` | Alternates; the decider stream of booleans picks the side. |
| `race(that)`, `raceAll(...streams)` | The first stream to emit wins; the others are interrupted. |
| `combine(that, s, f)` | Stateful pull from either side. |

## Grouping and batching

| Operator | Notes |
| --- | --- |
| `grouped(n)` | Arrays of `n`; the last may be shorter. |
| `groupedWithin(n, duration)` | Emits at `n` elements or when `duration` passes, whichever is first. |
| `rechunk(n)`, `chunks` | Change or expose chunk boundaries. |
| `sliding(n)`, `slidingSize(n, step)` | Windows. |
| `split(predicate)` | Splits at matching elements; drops the delimiters. |
| `groupAdjacentBy(key)` | Groups runs of equal keys. |
| `groupByKey(key)`, `groupBy((a) => Effect<[K, V]>)` | Emit `[key, Stream]` pairs. Consume them with `flatMap(..., { concurrency: "unbounded" })`, or the groups block each other. |
| `partition(filter, { capacity })`, `partitionEffect`, `partitionQueue` | Return `[passes, fails]` and need `Scope`. |
| `transduce(sink)`, `aggregate(sink)`, `aggregateWithin(sink, schedule)` | Run a sink repeatedly and emit each result. |
| `peel(sink)` | Runs a sink on the head, returns its result and the rest of the stream, under `Scope`. In 4.0.0 the sink's leftovers are lost: `peel(Stream.make(1, 2, 3, 4), Sink.take(2))` returned `[1, 2]` and a rest of `[]`. See the workaround in [effect-streams-sink-channel.md](effect-streams-sink-channel.md#peel-a-head-and-keep-the-rest). |

## Timing and rate

| Operator | Notes |
| --- | --- |
| `schedule(schedule)` | Waits per the schedule between elements. |
| `debounce(duration)` | Emits the last value after `duration` with no new value. |
| `throttle({ cost, units, duration, burst, strategy })`, `throttleEffect` | Token bucket per chunk. `"shape"` (default) delays; `"enforce"` drops. |
| `timeout(duration)` | Ends quietly when no value arrives in time. |
| `timeoutOrElse({ duration, orElse })` | Switches to `orElse()` on timeout. |
| `buffer({ capacity, strategy })`, `bufferArray` | `capacity: "unbounded"` or a number with `"suspend"`, `"dropping"`, `"sliding"`. |
| `interruptWhen(effect)`, `haltWhen(effect)` | Stop the stream when `effect` completes. They act between chunks: a chunk already pulled is delivered in full. `rechunk(1)` first for an element-level stop. |
| `repeat(schedule)`, `forever`, `repeatElements(schedule)` | `repeat` runs the whole pipeline again; an external source (an iterator, a queue) is not rewound. |

## Errors

`catch`, `catchTag`, `catchTags`, `catchIf`, `catchFilter`, `catchCause`, `catchCauseIf`, `catchCauseFilter`, `catchDefect`, `catchReason`, `catchReasons`, `unwrapReason`, `orElseSucceed`, `orElseIfEmpty`, `mapError`, `mapBoth`, `orDie`, `ignore`, `ignoreCause`, `tapError`, `tapErrorTag`, `tapCause`, `tapDefect`, `result` (emit `Result` values and end on the first failure), `retry(schedule)` (restarts the whole stream), `withExecutionPlan`.

## Lifecycle and context

`ensuring(finalizer)`, `onExit(f)`, `onError(f)`, `onStart(effect)`, `onFirst(f)`, `onEnd(effect)`, `provide(layer)`, `provideService(Tag, impl)`, `provideServiceEffect`, `provideContext`, `updateService`, `withSpan(name)`, `when(condition)`.

## Running

`run(sink)`, `runCollect`, `runDrain`, `runForEach`, `runForEachWhile`, `runForEachArray`, `runFold(() => s, f)`, `runFoldEffect`, `runHead`, `runLast`, `runCount`, `runSum`, `mkString`, `mkUint8Array`, `toPull`, `toQueue`, `runIntoQueue`, `toPubSub`, `runIntoPubSub`, `toReadableStream`, `toReadableStreamEffect`, `toAsyncIterable`, `toAsyncIterableEffect`.

## Sharing

`broadcast(stream, { capacity, strategy, replay })` and `broadcastN({ n, capacity })` return `Effect<Stream>` or a tuple of streams under `Scope`; the source starts when that effect runs. `share(stream, { capacity, replay, idleTimeToLive })` returns one stream that many consumers can run; the source starts with the first consumer. In both, a consumer gets only the values produced while it is subscribed, plus the last `replay` values. With `strategy: "suspend"` (the default) the slowest consumer sets the pace; `"dropping"` and `"sliding"` let a slow consumer miss values.

## Text and bytes

`decodeText({ encoding })`, `encodeText`, `splitLines`, `pipeThroughChannel(channel)`, `pipeThroughChannelOrFail`, `pipeThrough(sink)`.
