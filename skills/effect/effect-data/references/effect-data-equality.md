# Equality, Data classes, Equivalence and Order

Checked against `effect 4.0.0`. Read `node_modules/effect/src/Equal.ts`, `Hash.ts`, `Data.ts`, `Equivalence.ts` and `Order.ts` when a newer version is installed.

## How `Equal.equals` decides

In order:

1. `a === b` is equal. `NaN` equals `NaN`.
2. `null`, `undefined` and values of different `typeof` are not equal. Other primitives compare with `===`.
3. An object marked with `Equal.byReference` or `Equal.byReferenceUnsafe` is equal only to itself.
4. Different hashes are not equal (`Hash.hash` runs first).
5. `Date` compares the time. `RegExp` compares source and flags (`/abc/i` is not equal to `/abc/g`).
6. If both implement `Equal`, the result is `a[Equal.symbol](b)`. If only one does, they are not equal.
7. Arrays and typed arrays compare by length and element. `Map` and `Set` compare entries regardless of order.
8. Any other object compares its own keys and its prototype keys, deeply. The class is not checked: two plain classes with the same fields and no methods of their own give equal instances. (`Data` and `Schema` classes implement `Equal`, so rule 6 applies to them: a `Data.Class` instance never equals a plain object, and `Schema.Class` instances of different classes are not equal.)

The result of the outer comparison is cached in a `WeakMap` per pair of objects, `Date` included. The hash of each plain object, array, typed array, `Map` and `Set` is cached per object; `Date` and `RegExp` hashes are computed each time, but the cached pair result still hides a `Date` mutation. Do not mutate a value after it has been compared, hashed, or put in a `HashMap` or `HashSet`. Build a new value instead.

Cyclic structures are supported.

## Custom equality

Implement both symbols, and keep them consistent: values that are equal must have the same hash.

```ts
import * as Equal from "effect/Equal"
import * as Hash from "effect/Hash"
import * as HashMap from "effect/HashMap"
import * as Option from "effect/Option"

class Sku implements Equal.Equal {
  constructor(readonly code: string, readonly label: string) {}
  // two SKUs are the same product when the code matches, whatever the label
  [Equal.symbol](that: Equal.Equal): boolean {
    return that instanceof Sku && this.code.toUpperCase() === that.code.toUpperCase()
  }
  [Hash.symbol](): number {
    return Hash.string(this.code.toUpperCase())
  }
}

const stock = HashMap.make([new Sku("a-1", "Blue mug"), 4] as const)
export const mugs: Option.Option<number> = HashMap.get(stock, new Sku("A-1", "Mug, blue")) // Option.some(4)
```

`Hash` helpers: `Hash.hash(value)`, `Hash.string`, `Hash.number`, `Hash.combine(b)(a)`, `Hash.array`, `Hash.structure(object)`, `Hash.structureKeys(object, keys)`.

## Data classes and tagged unions

```ts
import * as Data from "effect/Data"
import * as Equal from "effect/Equal"

class Money extends Data.Class<{ readonly cents: number; readonly currency: string }> {
  add(that: Money): Money {
    return new Money({ cents: this.cents + that.cents, currency: this.currency })
  }
}

Equal.equals(new Money({ cents: 100, currency: "EUR" }), new Money({ cents: 100, currency: "EUR" })) // true

class Shipped extends Data.TaggedClass("Shipped")<{ readonly trackingId: string }> {}
new Shipped({ trackingId: "t-1" })._tag // "Shipped"

type Payment = Data.TaggedEnum<{
  Pending: {}
  Settled: { readonly reference: string }
  Refused: { readonly reason: string }
}>
const Payment = Data.taggedEnum<Payment>()

const describe = Payment.$match({
  Pending: () => "waiting",
  Settled: ({ reference }) => `settled as ${reference}`,
  Refused: ({ reason }) => `refused: ${reason}`
})

describe(Payment.Settled({ reference: "r-9" })) // "settled as r-9"
Payment.$is("Refused")(Payment.Pending()) // false
```

- `Data.Class<A>` and `Data.TaggedClass(tag)<A>` take one record argument; `TaggedClass` adds `_tag`. Add methods and getters in the class body.
- `Data.taggedEnum<T>()` returns one constructor per tag plus `$is` and `$match`. `$match` is exhaustive and works data-first (`$match(value, cases)`) or data-last.
- For a generic union, declare the union as a type alias, then a definition interface that applies it to `this["A"]`:

```ts
import * as Data from "effect/Data"

type Remote<A> = Data.TaggedEnum<{ Loaded: { readonly value: A }; Empty: {} }>
interface RemoteDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: Remote<this["A"]>
}
const Remote = Data.taggedEnum<RemoteDefinition>()

export const count: number = Remote.Loaded({ value: 3 }).value
```

- A plain factory function that returns an object literal gets the same equality; reach for `Data` when you want a class, methods or `_tag`.
- Use `Schema.Class` and `Schema.TaggedClass` when the value is decoded from or encoded to the outside world. They also compare by value.
- `Data.Error` and `Data.TaggedError` make yieldable errors; see the `effect-errors` skill.

## Equivalence

`Equivalence<A>` is `(a: A, b: A) => boolean`.

| Need | Use |
| --- | --- |
| Built-in | `Equivalence.String`, `Number`, `Boolean`, `BigInt`, `Date`, `strictEqual<A>()` |
| Compare a projection | `Equivalence.mapInput(base, (a) => key)` |
| All of several must hold | `Equivalence.combine(a, b)`, `Equivalence.combineAll([...])` |
| One per field or position | `Equivalence.Struct({ ... })`, `Equivalence.Tuple([...])`, `Equivalence.Record(value)` |
| `Equal.equals` as an equivalence | `Equal.asEquivalence<A>()` |
| For wrappers | `Option.makeEquivalence`, `Result.makeEquivalence`, `Redacted.makeEquivalence`, `Chunk.makeEquivalence` |

Use them with `Arr.dedupeWith`, `Arr.containsWith`, `Arr.differenceWith`, `Option.containsWith`.

## Order

`Order<A>` is `(a: A, b: A) => -1 | 0 | 1`.

| Need | Use |
| --- | --- |
| Built-in | `Order.String`, `Order.Number`, `Order.BigInt`, `Order.Boolean`, `Order.Date`, `Duration.Order`, `DateTime.Order`, `BigDecimal.Order` |
| Sort by a projection | `Order.mapInput(base, (a) => key)` |
| Tie-breaks | `Order.combine(first, second)`, `Order.combineAll([...])` |
| Descending | `Order.flip(order)` |
| Per field or position | `Order.Struct({ ... })`, `Order.Tuple([...])` |
| Comparisons | `Order.isLessThan(order)(a, b)`, `isGreaterThan`, `isLessThanOrEqualTo`, `isGreaterThanOrEqualTo` |
| Bounds | `Order.min(order)(a, b)`, `Order.max`, `Order.clamp(order)({ minimum, maximum })(a)`, `Order.isBetween(order)({ minimum, maximum })(a)` |
| Sort | `Arr.sort(items, order)`, `Arr.sortWith(items, (item) => key, order)`, `Arr.sortBy(orderA, orderB)(items)` |
| `None` first | `Option.makeOrder(order)`; flip it to put `None` last in a descending sort |
