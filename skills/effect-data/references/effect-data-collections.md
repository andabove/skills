# Collections, BigDecimal and Redacted

Checked against `effect 4.0.0`. Read `node_modules/effect/src/<Module>.ts` when a newer version is installed.

## Arrays first

Most Effect code uses `ReadonlyArray<A>` with the `Array` module, imported as `Arr` (`import * as Arr from "effect/Array"`). It is data-first and data-last, and never mutates its input.

| Need | Use |
| --- | --- |
| Sort | `Arr.sort(items, order)`, `Arr.sortWith(items, key, order)`, `Arr.sortBy(...orders)(items)` |
| Dedupe | `Arr.dedupe(items)` (uses `Equal.equals`), `Arr.dedupeWith(items, equivalence)` |
| Group | `Arr.groupBy(items, (a) => key)` returns a record of non-empty arrays |
| Safe access | `Arr.head`, `Arr.last`, `Arr.get(items, i)`, `Arr.findFirst` return `Option` |
| Split in two | `Arr.partition(items, (a) => Result.succeed(a) or Result.fail(a))` returns `[passes, fails]`; it takes a `Result`, not a boolean |
| Ranges | `Arr.range(1, 10)`, `Arr.makeBy(n, (i) => ...)` |

`Arr.isReadonlyArrayNonEmpty` narrows a `ReadonlyArray` to `NonEmptyReadonlyArray` (`Arr.isArrayNonEmpty` takes only a mutable `Array`); `Arr.headNonEmpty` and friends then return without `Option`.

## Chunk

`Chunk<A>` is an immutable sequence with cheap `append`, `prepend` and `appendAll`. In Effect 4, streams and sinks do not use it: `Stream.runCollect` and `Sink.collect` return arrays. Use a chunk for many appends or prepends, or where an API takes one (`Schema.Chunk`, `TxChunk`, `Channel.fromChunk`). Elsewhere it adds overhead without gain.

- Convert at the edge with `Chunk.toReadonlyArray` (keeps the non-empty type) or `Chunk.toArray`.
- `Chunk.fromIterable` copies. `Chunk.fromArrayUnsafe` does not copy, so the chunk changes if the array is mutated later.
- Chunks compare by value with `Equal.equals`.

## HashMap and HashSet

Immutable. Keys and elements compare with `Equal.equals`, so structurally equal objects are one key.

```ts
import * as HashMap from "effect/HashMap"
import * as Option from "effect/Option"

type Tally = HashMap.HashMap<string, number>

const count = (tally: Tally, word: string): Tally =>
  HashMap.modifyAt(tally, word, (current) => Option.some(Option.getOrElse(current, () => 0) + 1))

export const tally = ["a", "b", "a"].reduce(count, HashMap.empty<string, number>())
HashMap.get(tally, "a") // Option.some(2)
```

| Need | HashMap | HashSet |
| --- | --- | --- |
| Build | `make([k, v], ...)`, `fromIterable(entries)`, `empty()` | `make(...values)`, `fromIterable(values)`, `empty()` |
| Read | `get` (returns `Option`), `has`, `size`, `isEmpty` | `has`, `size`, `isEmpty`, `some`, `every`, `isSubset` |
| Write (returns a new collection) | `set`, `remove`, `removeMany`, `setMany`, `union` | `add`, `remove`, `union`, `intersection`, `difference` |
| Update one key | `modify(map, key, f)` (no-op when the key is missing), `modifyAt(map, key, (Option) => Option)` (insert, update or delete) | |
| Transform | `map`, `filter`, `filterMap`, `reduce`, `flatMap` | `map`, `filter`, `reduce` |
| Leave | `toEntries`, `toValues`, `keys`, `values` (iterators), `entries` | `Array.from(set)`; a set is iterable |

- Batch many writes with `HashMap.mutate(map, (draft) => { ... })` instead of a loop of `set`.
- Iteration order follows the hashes. Sort before you show or serialize the result.

## MutableHashMap and MutableHashSet

Same structural keys, mutated in place: `MutableHashMap.set(map, key, value)`, `get` (returns `Option`), `has`, `remove`, `modify`, `clear`, `size`. Use them for a local build loop or a cache that one fiber owns. Do not share them through `Ref` or between fibers; use the immutable versions there.

## BigDecimal

```ts
import * as BigDecimal from "effect/BigDecimal"
import * as Option from "effect/Option"

const price = BigDecimal.fromStringUnsafe("19.99")
const vat = BigDecimal.fromStringUnsafe("0.21")
const gross = BigDecimal.round(BigDecimal.multiply(price, BigDecimal.sum(BigDecimal.fromBigInt(1n), vat)), {
  scale: 2,
  mode: "half-even"
})

export const label = BigDecimal.format(gross) // "24.19"
export const perUnit: Option.Option<BigDecimal.BigDecimal> = BigDecimal.divide(gross, BigDecimal.fromBigInt(3n))
```

- Build from strings or bigints (`fromString`, `fromStringUnsafe`, `fromBigInt`, `make(value, scale)`). `fromNumber` carries the binary rounding of the `number` into the decimal.
- `divide` and `remainder` return `Option` (`None` for a zero divisor); `divideUnsafe` and `remainderUnsafe` throw. Division keeps up to 100 digits, so `round` to the scale you store.
- `round` defaults to scale `0` and mode `"half-from-zero"`. Pick the mode your domain needs (`"half-even"` for banker's rounding).
- `BigDecimal.equals` and `Equal.equals` ignore trailing zeros: `1.50` equals `1.5`. `normalize` removes them from the stored form.
- Decode it at the boundary with `Schema.BigDecimal` (see the `effect-schema` skill).

## Redacted

- `Redacted.make(secret)` wraps a value. `String`, `JSON.stringify`, `console.log` and every Effect logger print `<redacted>`.
- Read it with `Redacted.value(secret)`, only where the secret is used (an HTTP header, a driver option).
- Load secrets with `Config.Redacted("API_KEY")` (see the `effect-services` skill) or decode raw input with `Schema.RedactedFromValue(Schema.String)`. (`Schema.Redacted(Schema.String)` expects a `Redacted` value as input.)
- `Redacted.wipeUnsafe(secret)` deletes the value; a later `Redacted.value` throws.
- Compare with `Redacted.makeEquivalence(Equivalence.String)`.
