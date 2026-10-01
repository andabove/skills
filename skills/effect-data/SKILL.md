---
name: effect-data
description: Effect 4 data types, equality, caching and batching. Use when choosing or using Option, Result, Duration, DateTime, BigDecimal, Redacted, Chunk, HashMap or HashSet; when defining value classes or tagged unions with Data; when comparing or sorting with Equal, Equivalence or Order; when memoizing an effect with Effect.cached or Cache; or when batching lookups with Request and RequestResolver.
---

# Effect data types

Checked against `effect 4.0.0`. When the project has a newer version, read `node_modules/effect/src/<Module>.ts` for the API and `node_modules/effect/AGENTS.md` for the maintainers' guidance before you trust a name here. The source wins over this skill and over the website.

Import each module from its own subpath, as every example here does: `import * as Option from "effect/Option"`. Import the `Array` module as `Arr` (`import * as Arr from "effect/Array"`) so it does not shadow the global `Array`.

## Pick the type

| You have | Use | Reason |
| --- | --- | --- |
| A value that can be absent, and the absence flows through more logic | `Option<A>` | `map`, `flatMap`, `Option.gen` and `Effect.fromOption` compose it. Keep `A \| undefined` on JSON fields and convert at the edge. |
| A pure computation that succeeds with `A` or fails with `E` | `Result<A, E>` | Effect 4 name for Effect 3 `Either`. Inside an effect, use the error channel instead. |
| The outcome of a run, with defects and interruption | `Exit` and `Cause` | See [effect-errors](skill:effect-errors). |
| A span of time | `Duration` | Effect APIs that take a time (`Effect.sleep`, `Effect.timeout`, `Schedule`, cache TTLs) accept `Duration.Input`, such as `"5 seconds"`. |
| A point in time | `DateTime` | `DateTime.now` reads the `Clock`, so tests control it. Use it in place of `Date` and `Date.now()`. |
| Money or another exact decimal | `BigDecimal` | `0.1 + 0.2` is `0.30000000000000004` as a `number`, and `0.3` as a `BigDecimal`. |
| A secret | `Redacted<A>` | Prints as `<redacted>` in `String`, `JSON.stringify` and every built-in logger. |
| A list | `ReadonlyArray` and the `Arr` module | Reach for `Chunk` only where an API returns one (streams) or you append many times. |
| A map or set keyed by value, not by reference | `HashMap`, `HashSet` | They compare keys with `Equal.equals`. Native `Map` and `Set` compare by reference. |
| A value type with methods, or a tagged union | `Data.Class`, `Data.TaggedClass`, `Data.taggedEnum` | Constructor from one record, structural equality. Use `Schema.Class` when it crosses a boundary ([effect-schema](skill:effect-schema)). |
| An error type | `Schema.TaggedError` or `Data.TaggedError` | See [effect-errors](skill:effect-errors). |
| A comparison or sort by a field | `Equivalence`, `Order` | Derive from a base with `mapInput`, combine with `combine`. |
| An effect to run once and reuse | `Effect.cached`, `Effect.cachedWithTTL` | Section [Caching](#caching). |
| A lookup to memoize per key | `Cache` | Section [Caching](#caching). |
| Many small lookups to send as one call | `Request`, `RequestResolver`, `Effect.request` | Section [Batching](#batching). |

## Effect 3 names that changed

Code written from Effect 3 memory uses these names. They do not exist in 4.0.0.

| Effect 3 | Effect 4.0.0 |
| --- | --- |
| `Either`, `Either.right`, `Either.left`, `.right`, `.left` | `Result`, `Result.succeed`, `Result.fail`, `.success`, `.failure` (tags `"Success"`, `"Failure"`) |
| `Effect.either` | `Effect.result` |
| `Option.fromNullable` | `Option.fromNullishOr` (also `fromUndefinedOr`, `fromNullOr`) |
| `Option.getEquivalence`, `Option.getOrder` | `Option.makeEquivalence`, `Option.makeOrder` |
| `unsafeX` (`DateTime.unsafeMake`, `Chunk.unsafeFromArray`, `Redacted.unsafeWipe`) | `xUnsafe` (`DateTime.makeUnsafe`, `Chunk.fromArrayUnsafe`, `Redacted.wipeUnsafe`) |
| `Duration.decode`, `DurationInput` | `Duration.fromInputUnsafe` (throws) or `Duration.fromInput` (returns `Option`), `Duration.Input` |
| `Data.struct`, `Data.tuple`, `Data.array`, `Data.case`, `Data.tagged` | Plain objects and arrays; `Equal.equals` compares them by value now |
| `Order.reverse` | `Order.flip` |
| `RequestResolver.makeBatched` | `RequestResolver.make` |
| `Effect.withRequestBatching`, `Effect.withRequestCaching`, `{ batching: true }` | Gone. Batching follows concurrency; caching is `RequestResolver.withCache` or `RequestResolver.asCache` |
| `List`, `SortedMap`, `SortedSet` modules | Gone. Use `ReadonlyArray`, or `HashMap` and sort with `Order` on read |

## Option and Result

```ts
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Result from "effect/Result"

interface User {
  readonly id: string
  readonly managerId: string | undefined
}
declare const users: ReadonlyMap<string, User>

const findUser = (id: string): Option.Option<User> => Option.fromNullishOr(users.get(id))

const findManager = (id: string): Option.Option<User> =>
  findUser(id).pipe(
    Option.flatMap((user) => Option.fromNullishOr(user.managerId)),
    Option.flatMap(findUser)
  )

const parsePort = (raw: string): Result.Result<number, string> => {
  const port = Number(raw)
  return Number.isInteger(port) && port > 0 && port < 65536
    ? Result.succeed(port)
    : Result.fail(`invalid port: ${raw}`)
}

export const program = Effect.gen(function*() {
  // None fails with Cause.NoSuchElementError
  const manager = yield* Effect.fromOption(findManager("u-1"))
  // Failure fails with its error, here a string
  const port = yield* Effect.fromResult(parsePort("8080"))
  return { manager: manager.id, port }
})
```

- Convert with `Effect.fromOption` and `Effect.fromResult` before you `yield*` inside `Effect.gen`. In 4.0.0 an `Option` or `Result` is not an `Effect`: `yield* Option.some(1)` in `Effect.gen` is a type error and dies at runtime with "Not a valid effect". The website's Option and Result pages say otherwise; they are wrong for 4.0.0. `Exit` is an `Effect` and yields directly.
- Turn a failure into a value with `Effect.option` (drops the error) or `Effect.result` (keeps it).
- Use `Option.gen` and `Result.gen` for pure code only. They stop at the first `None` or `Failure`.
- Leave the boundary with `Option.getOrUndefined`, `Option.getOrElse(() => fallback)`, `Option.match` or `Result.match({ onSuccess, onFailure })`. Use `getOrThrow` only where a missing value is a bug.
- Combine many with `Option.all` and `Result.all` (tuple, struct or iterable). `Result.all` stops at the first failure; to keep every failure, `Arr.partition(inputs, parse)` returns `[successes, failures]` for a `parse` that returns a `Result`.

## Equality

`Equal.equals` compares by value by default in Effect 4: plain objects, arrays, `Map`, `Set`, `Date`, `RegExp`, typed arrays and class instances, deeply. `HashMap`, `HashSet`, `Data.*` and `Option` all use it.

```ts
import * as Equal from "effect/Equal"
import * as Hash from "effect/Hash"
import * as HashSet from "effect/HashSet"

HashSet.size(HashSet.make({ sku: "A1" }, { sku: "A1" })) // 1
new Set([{ sku: "A1" }, { sku: "A1" }]).size // 2: native Set compares by reference

// Equality on part of a value: implement Equal and a Hash that agrees with it
class Account implements Equal.Equal {
  constructor(readonly id: string, readonly lastSeen: Date) {}
  [Equal.symbol](that: Equal.Equal): boolean {
    return that instanceof Account && this.id === that.id
  }
  [Hash.symbol](): number {
    return Hash.string(this.id)
  }
}

HashSet.size(HashSet.make(new Account("a", new Date(1)), new Account("a", new Date(2)))) // 1
```

- Treat a value as frozen once it has been compared, hashed or used as a key. `Equal.equals` caches the result per pair of objects and `Hash.hash` caches per object, so a later mutation is not seen: once `Equal.equals(c, d)` has returned `true`, it still returns `true` after `c.n = 2`.
- Tell types apart with a `_tag` field. For plain classes, equality checks own and prototype keys and their values, not the class: instances of two classes with the same fields and no methods are equal to each other and to a plain object with those fields. A `Data.Class` instance never equals a plain object, and two different `Schema.Class` classes with the same fields are not equal.
- Opt one object out of structural comparison with `Equal.byReference(obj)` (returns a proxy) or `Equal.byReferenceUnsafe(obj)` (marks the object).
- `===` stays reference equality. Use `Equal.equals` when you mean value equality.

`Data.Class`, `Data.TaggedClass` and `Data.taggedEnum` give a constructor from one record and the same structural equality. Use `taggedEnum` for a union with `$is` and `$match`. The details and examples are in [the equality reference](references/effect-data-equality.md).

## Equivalence and Order

```ts
import * as Arr from "effect/Array"
import * as Equivalence from "effect/Equivalence"
import * as Order from "effect/Order"

interface Person {
  readonly email: string
  readonly lastName: string
  readonly age: number
}

const sameEmail = Equivalence.mapInput(Equivalence.String, (p: Person) => p.email.toLowerCase())
const byLastNameThenOldest = Order.combine(
  Order.mapInput(Order.String, (p: Person) => p.lastName),
  Order.flip(Order.mapInput(Order.Number, (p: Person) => p.age))
)

export const tidy = (people: ReadonlyArray<Person>) => Arr.sort(Arr.dedupeWith(people, sameEmail), byLastNameThenOldest)
```

- An `Order<A>` is `(a, b) => -1 | 0 | 1`. `Arr.sort` returns a new array; passing an `Order` to the native `.sort` mutates in place.
- Build orders and equivalences for wrapped values with `Option.makeOrder`, `Option.makeEquivalence` and `Redacted.makeEquivalence`. `Order.Struct` and `Equivalence.Struct` take one per field.
- `Order.min`, `Order.max`, `Order.clamp` and `Order.isBetween` take an `Order` first and return a function.

## Duration and DateTime

- Accept `Duration.Input` in your own APIs: `"250 millis"`, `"1.5 seconds"`, `"5 minutes"`, a `number` (milliseconds), `{ minutes: 1, seconds: 30 }` or a `Duration`. Normalize with `Duration.fromInputUnsafe`, which throws on a string like `"10 parsecs"`; `Duration.fromInput` returns `Option`.
- Get the current time with `yield* DateTime.now`. It reads the `Clock`, so `TestClock` moves it ([effect-testing](skill:effect-testing)). `DateTime.nowUnsafe()` reads the system clock and skips that.
- Parse untrusted input at the boundary with Schema (`Schema.DateTimeUtcFromString`). In code, `DateTime.make(input)` returns `Option<Utc>` and `DateTime.makeUnsafe` throws `IllegalArgumentError`.
- `DateTime.make` takes singular part names (`{ year, month, day, hour }`); `DateTime.add` and `DateTime.subtract` take plural unit names (`{ hours: 2 }`). Months are 1-based. Adding one month to 31 January gives 28 February.
- `DateTime.makeZonedUnsafe(parts, { timeZone })` reads the parts as UTC and then attaches the zone. Pass `adjustForTimeZone: true` when the parts are wall-clock time in that zone.

Zones, formatting and the `CurrentTimeZone` layers are in [the time reference](references/effect-data-time.md).

## Collections

- `HashMap.get` returns `Option`. `HashMap.set`, `HashSet.add` and the rest return a new collection; keep the result.
- Use `MutableHashMap` and `MutableHashSet` for a local build loop that never escapes the function. Keep the immutable ones in `Ref` state and in values you share between fibers.
- `HashMap` and `HashSet` iterate in hash order. Sort with an `Order` when the output order matters.

The operations and the `Chunk` rules are in [the collections reference](references/effect-data-collections.md).

## Caching

| Need | Use |
| --- | --- |
| Run an effect once, share the result | `const get = yield* Effect.cached(load)` |
| The same, refreshed after a time | `yield* Effect.cachedWithTTL(load, "5 minutes")` |
| The same, with a manual reset | `const [get, reset] = yield* Effect.cachedInvalidateWithTTL(load, "5 minutes")` |
| One result per key, bounded | `yield* Cache.make({ lookup, capacity, timeToLive })`, then `Cache.get(cache, key)` |
| Per-key TTL that depends on the outcome | `yield* Cache.makeWith(lookup, { capacity, timeToLive: (exit, key) => ... })` |

- Each call to `Effect.cached` or `Cache.make` makes a new, empty cache. Build it once, in a `Layer` or at startup, and share it.
- Failures are cached too. `Effect.cached` returns the first failure forever; `Cache` keeps a failed key for its `timeToLive`. Put `Effect.retry` inside the cached effect, or use `Cache.makeWith` with `timeToLive: (exit) => Exit.isSuccess(exit) ? "5 minutes" : Duration.zero` to keep failures out.
- Interruption is cached by `Effect.cached`: if the first run is interrupted (a timeout, a cancelled request), every later run fails with that interruption. Run the first load where nothing cancels it, such as the layer that builds the service.
- Concurrent `Cache.get` calls for one key run the lookup once and share the result. If every waiter is interrupted, the key is removed.
- A full `Cache` evicts the least recently used key. Without `timeToLive`, entries never expire.

## Batching

```ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Request from "effect/Request"
import * as RequestResolver from "effect/RequestResolver"

class GetUser extends Request.TaggedClass("GetUser")<{ readonly id: number }, { readonly name: string }, string> {}

declare const fetchUsers: (ids: ReadonlyArray<number>) => Promise<ReadonlyMap<number, { readonly name: string }>>

export class Users extends Context.Service<Users, {
  getUser(id: number): Effect.Effect<{ readonly name: string }, string>
}>()("app/Users") {
  static readonly layer = Layer.effect(
    Users,
    Effect.gen(function*() {
      const resolver = RequestResolver.make<GetUser>((entries) =>
        Effect.gen(function*() {
          const ids = [...new Set(entries.map((entry) => entry.request.id))]
          const found = yield* Effect.tryPromise({ try: () => fetchUsers(ids), catch: () => "users backend failed" })
          for (const entry of entries) {
            const user = found.get(entry.request.id)
            entry.completeUnsafe(user ? Exit.succeed(user) : Exit.fail(`no user ${entry.request.id}`))
          }
        })
      ).pipe(
        RequestResolver.setDelay("5 millis"),
        RequestResolver.withSpan("Users.getUser.batch")
      )
      return { getUser: (id) => Effect.request(new GetUser({ id }), resolver) }
    })
  )
}

// One backend call for all five lookups, because they run concurrently
export const loadAll = Effect.gen(function*() {
  const users = yield* Users
  return yield* Effect.forEach([1, 2, 1, 3, 2], users.getUser, { concurrency: "unbounded" })
})
```

- A batch holds the requests made concurrently. `Effect.forEach` without `concurrency` sends one call per request.
- The default batch window is one scheduler yield. Widen it with `RequestResolver.setDelay`; cap the size with `RequestResolver.batchN`.
- Complete every entry, with `entry.completeUnsafe(exit)` or `yield* Request.complete(entry, exit)`. An entry left open fails its caller with the defect "RequestResolver did not complete request". If the resolver effect fails, every entry in the batch fails with that error.
- A resolver receives duplicate requests. Dedupe the ids inside it, as above.
- `RequestResolver.withCache({ capacity })` collapses concurrent duplicates and serves later calls, but it keeps every result, failures included, with no expiry: one backend error is replayed until the entry is evicted. When the backend can fail, use `RequestResolver.asCache` with a `timeToLive` function that returns `Duration.zero` for failures, or no cache.
- `Effect.request` needs a resolver with no requirements. Build it in a `Layer` and close over the services it needs.

More shapes (`Request.Class`, `RequestResolver.fromEffect`, grouped resolvers, `asCache`) are in [the caching and batching reference](references/effect-data-caching-batching.md).
