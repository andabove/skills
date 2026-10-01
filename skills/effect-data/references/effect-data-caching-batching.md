# Caching and batching

Checked against `effect 4.0.0`. Read `node_modules/effect/src/Cache.ts`, `ScopedCache.ts`, `Request.ts` and `RequestResolver.ts`, and `Effect.cached*` in `Effect.ts`, when a newer version is installed.

## Effect.cached and its TTL forms

`const get = yield* Effect.cached(load)` does not run `load`. The first run of `get` runs it; later runs depend on that first run:

| First run | Later runs of `get` |
| --- | --- |
| Succeeded | Return the value, without running `load` again |
| Failed | Fail with the same error, without running `load` again |
| Interrupted | Fail with the same interruption, without running `load` again |
| Still running | Wait for it and share its outcome |

The interrupted row is the trap: if the first caller times out or is cancelled, every later caller is interrupted too. Start the first run in a fiber that is not cancelled (for example in the layer that builds the service), or use `Effect.cachedInvalidateWithTTL` and call the invalidate effect on failure.

- `Effect.cachedWithTTL(load, "5 minutes")` runs `load` again on the first use after the TTL.
- `Effect.cachedInvalidateWithTTL(load, ttl)` returns `[get, invalidate]`. Run `invalidate` to force the next `get` to reload.
- Each call creates a new cache. Create it once and keep the returned effect.

## Cache

```ts
import * as Cache from "effect/Cache"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"

interface Rate {
  readonly currency: string
  readonly perEuro: number
}
declare const fetchRate: (currency: string) => Effect.Effect<Rate, "RateUnavailable">

export class Rates extends Context.Service<Rates, {
  get(currency: string): Effect.Effect<Rate, "RateUnavailable">
}>()("app/Rates") {
  static readonly layer = Layer.effect(
    Rates,
    Effect.gen(function*() {
      const cache = yield* Cache.makeWith(fetchRate, {
        capacity: 200,
        // keep good answers for 10 minutes, retry failures on the next call
        timeToLive: (exit) => Exit.isSuccess(exit) ? "10 minutes" : Duration.zero
      })
      return { get: (currency) => Cache.get(cache, currency) }
    })
  )
}
```

| Function | Behaviour |
| --- | --- |
| `Cache.make({ lookup, capacity, timeToLive? })` | One TTL for every entry; no TTL means no expiry |
| `Cache.makeWith(lookup, { capacity, timeToLive?: (exit, key) => Duration.Input })` | TTL per entry, chosen from the outcome |
| `Cache.get(cache, key)` | Cached value, or run the lookup once for all concurrent callers |
| `Cache.getOption(cache, key)` | Does not start a lookup: `None` when the key is missing, waits for a pending lookup, fails with a cached failure |
| `Cache.getSuccess(cache, key)` | Like `getOption`, for successful entries only |
| `Cache.set(cache, key, value)` | Put a value without a lookup |
| `Cache.refresh(cache, key)` | Run the lookup again and replace the entry |
| `Cache.invalidate`, `invalidateWhen`, `invalidateAll` | Remove one key, one key when a predicate holds, or all |
| `Cache.has`, `size`, `keys`, `values`, `entries` | Inspect |

- The lookup's requirements belong to `Cache.make` by default: the services are captured when the cache is built. Pass `requireServicesAt: "lookup"` to require them at each `Cache.get` instead.
- A full cache evicts the least recently used key.
- Use `ScopedCache` when a cached value owns a resource: its lookup may use `Effect.acquireRelease`, and the release runs when the entry is evicted or invalidated, or when the cache's scope closes.

## Requests

A request is a value that describes one lookup and its result types. Requests compare by value.

```ts
import * as Request from "effect/Request"

interface Order {
  readonly id: string
  readonly total: number
}

// Class form: fields, then success, error and (optional) requirements types
export class GetOrder extends Request.TaggedClass("GetOrder")<{ readonly id: string }, Order, "OrderNotFound"> {}

// Interface form, when you prefer plain objects
export interface CountOrders extends Request.Request<number, never> {
  readonly _tag: "CountOrders"
  readonly customerId: string
}
export const CountOrders = Request.tagged<CountOrders>("CountOrders")

new GetOrder({ id: "o-1" })
CountOrders({ customerId: "c-1" })
```

`Request.Class<Fields, A, E, R>` is the same without `_tag`.

## Resolvers

| Constructor | Use when |
| --- | --- |
| `RequestResolver.make<R>((entries) => Effect)` | The backend takes a batch. Complete every entry |
| `RequestResolver.makeGrouped<R, K>({ key: (entry) => K, resolver: (entries, key) => Effect })` | One batch per key, such as per tenant |
| `RequestResolver.fromEffect<R>((entry) => Effect)` | No batch endpoint; runs one effect per request, concurrently |
| `RequestResolver.fromEffectTagged<R>()({ TagA: (entries) => ..., TagB: ... })` | A union of request types, one batch function per tag, each returning results in entry order |
| `RequestResolver.fromFunction`, `fromFunctionBatched` | Synchronous resolution without failure |

Complete an entry with `entry.completeUnsafe(Exit.succeed(value))`, `entry.completeUnsafe(Exit.fail(error))`, or effectfully with `Request.complete(entry, exit)`, `Request.succeed(entry, value)`, `Request.fail(entry, error)`. `entry.request` is the request; `entry.context` holds its services.

Options, each returning a new resolver:

| Pipe | Effect |
| --- | --- |
| `RequestResolver.setDelay("10 millis")` | Wait this long to collect a batch (default: one scheduler yield) |
| `RequestResolver.batchN(100)` | At most 100 entries per batch |
| `RequestResolver.withSpan("name")` | A span around each batch, linked to the callers' spans |
| `RequestResolver.withCache({ capacity, strategy? })` | Returns an `Effect` of a resolver that caches by request value and collapses concurrent duplicates. `strategy` is `"lru"` (default) or `"fifo"`. No expiry, and failures are cached too |
| `RequestResolver.asCache({ capacity, timeToLive?: (exit, request) => Duration.Input })` | Returns an `Effect` of a `Cache` keyed by request, with the `Cache` functions. `timeToLive` is a function, not a duration. Unlike `Cache.make`, it defaults to `requireServicesAt: "lookup"` |

`withCache` and `asCache` return effects: `yield*` them inside the layer that builds the service, so one cache serves every call.

## Rules that the runtime enforces

- Only concurrent requests share a batch. `Effect.forEach(ids, get)` runs one batch per id; add `{ concurrency: "unbounded" }` or a number.
- An entry the resolver does not complete fails its caller with the defect "Effect.request: RequestResolver did not complete request".
- When the resolver effect fails with `E`, every entry still open in that batch fails with `E`; entries it already completed keep their results.
- Interrupting a caller after its batch started removes that caller only; the resolver runs on. Interrupting the resolver itself (for example `Effect.timeout` inside `runAll`) interrupts its `Effect.tryPromise` and aborts the signal passed to `try`. Forward that signal to the transport, or the HTTP request runs to its end anyway.
- Without `withCache`, the resolver receives duplicates: five concurrent calls for ids `1, 2, 1, 3, 2` give one batch of five entries.
- `Effect.request(request, resolver)` also accepts an `Effect` that builds the resolver; its error and requirement types join the result.
