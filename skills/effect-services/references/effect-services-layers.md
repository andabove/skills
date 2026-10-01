# Layers in depth

Reference for [effect-services](../SKILL.md). Checked against `effect 4.0.0`; the source is `node_modules/effect/src/Layer.ts` and `LayerMap.ts`.

## The type

`Layer<ROut, E = never, RIn = never>`: building it produces the services `ROut`, can fail with `E`, and needs the services `RIn`. A layer is a value that describes construction. Nothing runs until a runtime builds it.

## Constructors

| Constructor | Builds |
| --- | --- |
| `Layer.succeed(S, value)` | a service from a ready value |
| `Layer.sync(S, () => value)` | a service from a lazy, synchronous constructor |
| `Layer.effect(S, effect)` | a service from an effect. The effect may read services and config, and acquire resources with `acquireRelease`; those resources close with the layer. |
| `Layer.effectDiscard(effect)` | no service: startup work, or background fibers started with `Effect.forkScoped` |
| `Layer.effectContext(effect)` | several services at once from an effect that returns a `Context` |
| `Layer.unwrap(effect)` | the layer that an effect returns, chosen at build time |
| `Layer.empty` | nothing; the identity for `merge` |
| `Layer.mock(S, partial)` | a test double that implements only some methods. See [effect-testing](skill:effect-testing). |

Version 4 has no `Layer.scoped` and no `Layer.function`. `Layer.effect` covers scoped construction.

## Combinators

```ts
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

class Now extends Context.Service<Now, { readonly now: Effect.Effect<number> }>()("myapp/Now") {
  static readonly layer = Layer.succeed(Now, Now.of({ now: Clock.currentTimeMillis }))
}

class Ids extends Context.Service<Ids, { readonly next: Effect.Effect<string> }>()("myapp/Ids") {
  static readonly layerNoDeps = Layer.effect(
    Ids,
    Effect.gen(function* () {
      const now = yield* Now
      return Ids.of({ next: Effect.map(now.now, (n) => `id-${n}`) })
    })
  )
}

// still needs Now
export const idsOpen: Layer.Layer<Ids, never, Now> = Ids.layerNoDeps

// Now is built and hidden
export const ids: Layer.Layer<Ids> = Ids.layerNoDeps.pipe(Layer.provide(Now.layer))

// Now is built and also exposed
export const idsAndNow: Layer.Layer<Ids | Now> = Ids.layerNoDeps.pipe(Layer.provideMerge(Now.layer))

// side by side: merge does not feed Now into Ids
export const merged: Layer.Layer<Ids | Now, never, Now> = Layer.mergeAll(Ids.layerNoDeps, Now.layer)
```

- `Layer.provide(self, that)` and `Layer.provideMerge(self, that)` take one layer or an array of layers as `that`.
- Use `provide` for dependencies the outside world should not reach. Use `provideMerge` when callers also need the dependency, for example a test that inspects a fake.
- `Layer.merge(a, b)` and `Layer.mergeAll(...layers)` do not wire outputs into inputs. When one merged layer needs another, add `Layer.provide` as well.

## Built-in services

Effect provides five services with no layer: `Clock.Clock`, `Console.Console`, `Random.Random`, `ConfigProvider.ConfigProvider` and `Tracer.Tracer`. Each is a `Context.Reference`, so it adds nothing to `R`. Read them through their modules (`Clock.currentTimeMillis`, `Console.log`, `Random.nextInt`), and override one for a region with `Effect.provideService` or a helper:

```ts
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Random from "effect/Random"

const roll = Effect.gen(function* () {
  const n = yield* Random.nextIntBetween(1, 6)
  yield* Console.log(`rolled ${n}`)
  return n
})

// each call seeds a new generator, so each run gives the same numbers
export const seeded = () => roll.pipe(Random.withSeed("test-seed"))

// capture console output instead of printing it
const lines: Array<string> = []
export const captured = roll.pipe(
  Effect.provideService(Console.Console, { ...globalThis.console, log: (...args) => { lines.push(args.join(" ")) } })
)
```

- `Random.withSeed` creates its generator when you call it. Running one seeded effect value twice continues the same sequence; call `withSeed` per run, as `seeded()` does, for repeatable results.
- Read time through `Clock`, not `Date.now()`. A service built on `Date.now()` ignores the test clock; tests then have to replace that service. `TestClock` belongs to [effect-testing](skill:effect-testing).
- An override applies only to the effect it is provided to. Use `Layer.succeed(Console.Console, ...)` in the app layer to change it everywhere.

## Naming

The names below are a convention, not an API. Keep them consistent in a codebase.

| Static field | Meaning |
| --- | --- |
| `layer` | the live implementation with its own dependencies provided. Callers provide nothing. |
| `layerNoDeps` | the live implementation with dependencies still open. Tests provide fakes for them. |
| `layerTest` or `layerInMemory` | a fake implementation for tests or local development |
| `layerConfig(options)` | a layer factory that takes options. Call it once and keep the result. |

## Memoization

- Within one build, a layer object is built once, however many layers depend on it. `Layer.merge(Layer.provide(A, Db), Layer.provide(B, Db))` opens one `Db`.
- The key is the object reference. A factory called twice gives two objects and two builds. Store the layer in a constant or a static field.
- `Layer.fresh(layer)` opts out: that use builds a new instance.
- `Effect.provide(effect, layer)` reuses the layer when an enclosing build (a `ManagedRuntime` or an outer `Effect.provide`) already built that same object. Otherwise each call is its own build: two calls build the layer twice, and each closes its own copy when its effect ends.
- Each `ManagedRuntime` has its own memo map. Two runtimes that must share built layers take one `Layer.makeMemoMapUnsafe()` through `ManagedRuntime.make(layer, { memoMap })`.

## Choose an implementation at build time

```ts
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export class Store extends Context.Service<Store, {
  get(key: string): Effect.Effect<string | undefined>
}>()("myapp/Store") {
  static readonly layerInMemory = Layer.sync(Store, () => {
    const data = new Map<string, string>()
    return Store.of({ get: (key) => Effect.sync(() => data.get(key)) })
  })

  static readonly layerRemote = (url: URL) =>
    Layer.succeed(Store, Store.of({ get: (key) => Effect.succeed(`${url.host}:${key}`) }))

  static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const inMemory = yield* Config.Boolean("STORE_IN_MEMORY").pipe(Config.withDefault(false))
      if (inMemory) return Store.layerInMemory
      return Store.layerRemote(yield* Config.URL("STORE_URL"))
    })
  )
}
```

## Background work

`Layer.effectDiscard` with `Effect.forkScoped` starts a fiber when the layer is built and interrupts it when the layer closes. Put the cleanup that must run on the scope, because a fiber interrupted before it starts runs none of its body.

```ts
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export const Heartbeat = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* Effect.addFinalizer(() => Effect.log("heartbeat stopped"))
    yield* Effect.forkScoped(Effect.forever(Effect.log("alive").pipe(Effect.delay("30 seconds"))))
  })
)
```

## Errors during construction

- The layer's `E` joins the error channel of the effect it is provided to. With `ManagedRuntime`, each run rejects with it.
- `Layer.catch((error) => fallbackLayer)` replaces a failed layer. `Layer.catchTag("Tag", ...)` matches one tagged error.
- `Layer.orDie` turns construction errors into defects when the app cannot start without the service.
- `Layer.tap` and `Layer.tapError` run an effect after a build succeeds or fails, for logs.

## Keyed resources: LayerMap

Use `LayerMap.Service` when a resource exists per key, such as one pool per tenant. It builds a key's layer on first use, reuses it, and releases it after `idleTimeToLive` without use or on `invalidate`.

```ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as LayerMap from "effect/LayerMap"

class TenantDb extends Context.Service<TenantDb, { readonly tenant: string }>()("myapp/TenantDb") {
  static readonly layer = (tenant: string) =>
    Layer.effect(
      TenantDb,
      Effect.acquireRelease(
        Effect.sync(() => TenantDb.of({ tenant })),
        () => Effect.log(`closing pool for ${tenant}`)
      )
    )
}

export class TenantDbs extends LayerMap.Service<TenantDbs>()("myapp/TenantDbs", {
  lookup: (tenant: string) => TenantDb.layer(tenant),
  idleTimeToLive: "5 minutes"
}) {}

export const forTenant = (tenant: string) =>
  TenantDb.use((db) => Effect.succeed(db.tenant)).pipe(Effect.provide(TenantDbs.get(tenant)))

export const program = forTenant("acme").pipe(Effect.provide(TenantDbs.layer))
```

`TenantDbs.get(key)` returns a layer, so `Effect.provide(TenantDbs.get(key))` here does not rebuild per call: the map caches the build. `TenantDbs.invalidate(key)` closes that key's resources; the next `get` rebuilds.

## A layer as the whole program

- `Layer.launch(layer)` builds the layer and keeps it alive until interrupted. Use it for servers and workers with `NodeRuntime.runMain`.
- `Layer.build(layer)` returns the built `Context` and needs a `Scope`. Use it in tooling that inspects a graph; application code uses `Effect.provide` or `ManagedRuntime`.
