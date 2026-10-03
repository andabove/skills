---
name: effect-services
description: Effect 4 services, layers and resources. Use when you define, compose or provide a dependency with Context.Service, Context.Reference or Layer, manage a resource lifetime with Scope or acquireRelease, read configuration with Config, run Effect code inside Hono, Express, Next.js, Nitro or another framework through ManagedRuntime, or use a platform service such as FileSystem or Path.
---

# Effect services, layers and resources

Checked against `effect 4.0.0` and `@effect/platform-node 4.0.0`. When the project has a newer version, read `node_modules/effect/src/Context.ts`, `Layer.ts`, `Scope.ts`, `Config.ts` and `ManagedRuntime.ts`, and `node_modules/effect/AGENTS.md`. The installed source wins over this skill.

## Decide: service or plain function

A service costs a requirement in every caller's type (`Effect<A, E, R>`), a layer, and a test double. Write a plain function, or an `Effect.fn` function, when the code has nothing to swap and nothing to close: pure logic, data shaping, a calculation, a helper with one caller.

Make a service when one of these is true:

- It reaches outside the process: a database, an HTTP API, a queue, mail, the file system.
- A test needs a fake for it.
- It owns a resource with a lifetime: a pool, a client, a socket, a background fiber.
- It needs configuration, or several modules must share one instance.

Cut services by capability, one per boundary (`UserRepo`, `Mailer`, `Payments`). A service whose methods only call pure functions is ceremony: write those as functions.

## Define a service

```ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

export class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", {
  userId: Schema.String
}) {}

export interface User { readonly id: string; readonly email: string }

export class UserRepo extends Context.Service<UserRepo, {
  findById(id: string): Effect.Effect<User, UserNotFound>
}>()("myapp/users/UserRepo") {
  static readonly layer = Layer.effect(
    UserRepo,
    Effect.gen(function* () {
      const rows = new Map<string, User>([["u1", { id: "u1", email: "ada@example.com" }]])
      const findById = Effect.fn("UserRepo.findById")(function* (id: string) {
        const user = rows.get(id)
        if (user === undefined) return yield* new UserNotFound({ userId: id })
        return user
      })
      return UserRepo.of({ findById })
    })
  )
}
```

- Write `Context.Service<Self, Shape>()("id")`: the class first, the shape second. The id string is the runtime identity. Two services with the same id share one slot, so one value answers for both. Prefix the id with the app or package name and the path: `"myapp/users/UserRepo"`.
- Keep `R = never` on every method of the shape. Read dependencies (`yield* Sql`, `yield* Config.String(...)`) in the layer's constructor, so callers and test doubles never see them. A method typed `Effect<A, E, Sql>` pushes `Sql` into every caller.
- Build the value with `UserRepo.of({ ... })` so TypeScript checks it against the shape. Write methods with `Effect.fn("UserRepo.findById")` to get a span per call.
- Attach layers as static fields: `layer` with its dependencies included, and `layerNoDeps` when tests swap a dependency.
- Read the service with `yield* UserRepo` in `Effect.gen`, or `UserRepo.use((repo) => repo.findById(id))` for one call. The shape type is `UserRepo["Service"]`.
- The second form, `Context.Service<Self>()("id", { make: effect })`, keeps the constructor on the class; its layer is `Layer.effect(this, this.make)`. Use it for a service with one implementation whose shape is whatever `make` returns. Use the interface form when the shape is a contract with a live and a test implementation.

## Context.Reference: a value with a default

Use `Context.Reference` for a setting, a feature flag or a per-request value with a sensible default. It adds nothing to `R`: code reads the default until something provides another value.

```ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"

export const NewCheckout = Context.Reference<boolean>("myapp/flags/NewCheckout", {
  defaultValue: () => false
})

const price = Effect.gen(function* () {
  return (yield* NewCheckout) ? 90 : 100
})

export const discounted = price.pipe(Effect.provideService(NewCheckout, true))
```

The built-in services are references too: `Clock.Clock`, `Console.Console`, `Random.Random`, `ConfigProvider.ConfigProvider` and `Tracer.Tracer` need no layer. Override one for a region with `Effect.provideService` or a helper such as `Random.withSeed`. Read time through `Clock`, not `Date.now()`, so a test clock can control it. Details: [references/effect-services-layers.md](references/effect-services-layers.md).

## Compose layers

A `Layer<Out, E, In>` builds the services `Out`, can fail with `E`, and needs `In`.

| Constructor | Use it for |
| --- | --- |
| `Layer.succeed(S, value)` | a value with no construction work |
| `Layer.effect(S, effect)` | a constructor that reads services, config or resources. A resource acquired inside lives as long as the layer. Version 4 has no `Layer.scoped`. |
| `Layer.effectDiscard(effect)` | startup work or a background fiber that provides no service |
| `Layer.unwrap(effect)` | a layer chosen at build time, for example from config |

- `Layer.provide(self, deps)` feeds `deps` into `self` and hides them. `deps` can be one layer or an array.
- `Layer.provideMerge(self, deps)` feeds `deps` into `self` and outputs both.
- `Layer.mergeAll(a, b, c)` sets independent layers side by side. Their inputs add up.

```ts
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"

export class SqlError extends Schema.TaggedError<SqlError>()("SqlError", { cause: Schema.Defect() }) {}

interface Pool {
  query(text: string): Promise<ReadonlyArray<unknown>>
  end(): Promise<void>
}
declare function openPool(url: string): Pool

export class Sql extends Context.Service<Sql, {
  query(text: string): Effect.Effect<ReadonlyArray<unknown>, SqlError>
}>()("myapp/db/Sql") {
  static readonly layer = Layer.effect(
    Sql,
    Effect.gen(function* () {
      const url = yield* Config.Redacted("DATABASE_URL")
      const pool = yield* Effect.acquireRelease(
        Effect.sync(() => openPool(Redacted.value(url))),
        (pool) => Effect.promise(() => pool.end())
      )
      return Sql.of({
        query: (text) => Effect.tryPromise({ try: () => pool.query(text), catch: (cause) => new SqlError({ cause }) })
      })
    })
  )
}

export class Reports extends Context.Service<Reports, {
  readonly daily: Effect.Effect<number, SqlError>
}>()("myapp/reports/Reports") {
  static readonly layerNoDeps = Layer.effect(
    Reports,
    Effect.gen(function* () {
      const sql = yield* Sql
      return Reports.of({ daily: Effect.map(sql.query("select 1"), (rows) => rows.length) })
    })
  )
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Sql.layer))
}

export const AppLayer = Layer.mergeAll(Reports.layer, Sql.layer)
```

- Wrap a driver call with `Effect.tryPromise` and a tagged error, and put the error in the shape. `Effect.promise` turns a rejection into a defect, which `Effect.retry` and `catchTag` skip.

- Build the whole graph into one `AppLayer` and provide it once at the edge. Inside one build, a layer object that several layers use is built once and shared: `Sql.layer` above opens one pool.
- Memoization is by object reference. A factory such as `makeSqlLayer()` called twice gives two layers and two pools. Call it once and reuse the value. Use `Layer.fresh(layer)` when you want a second instance on purpose.
- `Effect.provide(effect, layer)` reuses a build only when an enclosing build (a `ManagedRuntime` or an outer `Effect.provide`) already made that same layer object. Otherwise it builds the layer for that run and closes it at the end: inside a request handler, a loop or a service method, one pool per call. Provide at the edge only, and use `Layer.fresh` when you want a new instance.
- The layer's `E` becomes the program's failure. Recover with `Layer.catch` or `Layer.catchTag`, or turn it into a defect with `Layer.orDie`.
- Load a heavy SDK at its first use, not at boot. A `ManagedRuntime` builds every layer at its first run, so a static import of the SDK, or an import in the layer's build, loads it for the first request of any kind, a health check included. Import only its types statically, run `import("the-sdk")` inside the service method, and guard the static import with a lint rule. Example: [references/effect-services-layers.md](references/effect-services-layers.md#load-a-heavy-sdk-at-first-use).

More constructors, `Layer.unwrap`, `LayerMap` and naming: [references/effect-services-layers.md](references/effect-services-layers.md).

## Resources and Scope

`Effect.acquireRelease(acquire, release)` gives an effect that needs a `Scope`. The release runs once when that scope closes, on success, failure or interruption, and receives the `Exit`. Acquisition is uninterruptible. Finalizers run in reverse order of acquisition.

Choose the scope by the lifetime of the resource:

- For the life of the app (a pool, a client), acquire it in `Layer.effect`, as `Sql.layer` does. The layer's scope closes at shutdown or at `runtime.dispose()`.
- For one request or one job, wrap that unit in `Effect.scoped`.
- For one use, write `Effect.acquireUseRelease(acquire, use, release)`.

Traps:

- A value returned out of `Effect.scoped` is already released. Do the work inside the scope, or move the resource into a layer.
- `Effect.forkScoped` interrupts the fiber when its scope closes. A fiber interrupted before it starts runs none of its body, its own `onInterrupt` included. Register cleanup on the scope (`acquireRelease`, `Effect.addFinalizer`), not only inside the forked fiber.
- An acquire that never settles holds its scope open forever, and `runtime.dispose()` and a server stop wait for it. If the acquire calls a function that takes no signal, give it a deadline with `Effect.timeout` inside the acquire. Close a resource that opens after the deadline. Example: [references/effect-services-resources.md](references/effect-services-resources.md#give-the-acquire-a-deadline).

Manual scopes, rollback on failure and finalizer helpers: [references/effect-services-resources.md](references/effect-services-resources.md).

## Config

A `Config<A>` describes how to read and decode one value. It is also an Effect, so `yield*` it. With no provider installed, it reads a copy of `process.env` taken at the first config read; later changes to `process.env` are not seen.

```ts
import * as Config from "effect/Config"

// reads SMTP_HOST, SMTP_PORT and SMTP_PASSWORD; yield* it in a layer constructor
export const MailConfig = Config.all({
  host: Config.NonEmptyString("HOST"),
  port: Config.Port("PORT").pipe(Config.withDefault(587)),
  password: Config.Redacted("PASSWORD")
}).pipe(Config.nested("SMTP"))
```

- Read config in the layer that needs it, not at module scope and not in each method call. A missing or invalid value then fails the layer build with a `ConfigError` that names the key: at startup under `runMain`, at the first run under a lazy `ManagedRuntime` (see below).
- `Config.withDefault(x)` applies only when the key is absent or empty. An invalid value still fails. `Config.orElse` recovers from every error, bad input included: use it only when that is the intent. `Config.option` gives an `Option`.
- Read secrets with `Config.Redacted`. `String(secret)` and `JSON.stringify` show `<redacted>`. Call `Redacted.value(secret)` only where the secret is used.
- `Config.nested("SMTP")` joins path segments with `_`: `SMTP_HOST`. Keys are used as written. To read a camelCase key such as `databaseHost` from `DATABASE_HOST`, or a `Config.schema` field `host` under `"server"` from `SERVER_HOST`, install `ConfigProvider.fromEnv().pipe(ConfigProvider.constantCase)`.
- Prefer `Config.Finite`, `Config.Int` or `Config.Port` to `Config.Number`, which accepts `NaN`. `Config.Boolean` accepts only lowercase `true false yes no on off 1 0 y n`.
- In tests, provide `ConfigProvider.layer(ConfigProvider.fromUnknown({ ... }))`, or call `config.parse(provider)`.

Every constructor, providers, `.env` files and schemas: [references/effect-services-config.md](references/effect-services-config.md).

## Run at the edge

Choose by who owns the process entry point.

**You own it** (a script, a worker, a server you start): express the app as layers and hand it to `NodeRuntime.runMain` from `@effect/platform-node`. On SIGINT or SIGTERM it interrupts the program and runs every finalizer. On failure it logs the cause and exits with code 1.

For a long-running app (a server, a worker), write `NodeRuntime.runMain(Layer.launch(AppLayer))`. For a program that ends, write `NodeRuntime.runMain(main.pipe(Effect.provide(AppLayer)))`. Import `NodeRuntime` from `@effect/platform-node/NodeRuntime`.

**A framework owns it** (Hono, Express, Next.js, Nitro, a queue consumer): make one `ManagedRuntime` from the app layer at module scope, and run each handler's effect through it.

```ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Schema from "effect/Schema"

class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", { id: Schema.String }) {}

class Todos extends Context.Service<Todos, {
  find(id: string): Effect.Effect<{ readonly id: string; readonly title: string }, TodoNotFound>
}>()("myapp/todos/Todos") {
  static readonly layer = Layer.succeed(Todos, Todos.of({
    find: (id) => id === "1" ? Effect.succeed({ id, title: "Write docs" }) : Effect.fail(new TodoNotFound({ id }))
  }))
}

export const runtime = ManagedRuntime.make(Todos.layer)

export const getTodo = (id: string) =>
  Todos.use((todos) => todos.find(id)).pipe(
    Effect.map((todo) => Response.json(todo)),
    Effect.catchTag("TodoNotFound", (e) => Effect.succeed(Response.json({ error: `No todo ${e.id}` }, { status: 404 })))
  )

// Next.js App Router: app/todos/[id]/route.ts
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  return runtime.runPromise(getTodo(id), { signal: request.signal })
}
```

- `ManagedRuntime.make(layer)` builds nothing until the first run. Concurrent first runs share one build, and later runs reuse it. When the layer fails, each run rejects with the layer's error. To fail fast, await `runtime.runPromise(Effect.void)` at startup, before the server listens.
- On a typed failure, `runtime.runPromise` rejects with the error value. Catch the handler's typed errors inside the effect and turn them into responses. The promise can still reject on interruption (an aborted request), on a layer build failure such as a `ConfigError`, and on defects.
- Pass the request's abort signal as `{ signal }`. A client disconnect then interrupts the work and runs its finalizers. The run then ends interrupted, even when an uninterruptible write finished. A handler that must answer after a close runs with no signal (see `effect-concurrency`).
- Call `await runtime.dispose()` at shutdown. It interrupts the fibers of the runs that the runtime started (`runtime.run*`), then closes the layer scope. A run after `dispose` rejects with `ManagedRuntime disposed`.
- `dispose()` does not reach a run that the runtime did not make, such as `Effect.runPromiseExitWith(await runtime.context())(work)`. That work runs on after a server stop, with its layers already closed. Run long-lived work that must stop at shutdown, such as a socket's session, through the runtime.
- Make one runtime per process. A runtime per request rebuilds every layer per request, and a dev server that re-evaluates modules makes a new runtime per reload: keep it on `globalThis` in development.

Hono, Express, Next.js and Nitro glue, request-scoped values and shutdown: [references/effect-services-frameworks.md](references/effect-services-frameworks.md).

**Platform services.** `effect` ships platform-neutral service keys: `FileSystem.FileSystem`, `Path.Path`, `Terminal.Terminal` and others. Code depends on the key, and the edge provides an implementation: `NodeServices.layer` from `@effect/platform-node`, or `BunServices.layer` from `@effect/platform-bun`. Tests stub only the methods they call with `FileSystem.layerNoop({ ... })`. Details: [references/effect-services-platform.md](references/effect-services-platform.md).

## Review

To review Effect code against this skill, mark each rule bullet above pass or fail for the diff, with the `file:line` of each failure. A rule the diff does not touch passes. Done when every bullet has a mark.

## Related skills

- [effect](skill:effect) for the Effect type, `Effect.gen`, `Effect.fn` and running effects.
- [effect-errors](skill:effect-errors) for tagged errors, `catchTag` and `Cause`.
- [effect-schema](skill:effect-schema) for decoding request input and `Schema.TaggedError`.
- [effect-testing](skill:effect-testing) for test layers and `@effect/vitest`.
- [effect-concurrency](skill:effect-concurrency) for fibers, `forkScoped` and interruption.
- [effect-observability](skill:effect-observability) for logger and tracer layers.
- [effect-adoption](skill:effect-adoption) for adding services to an existing Promise codebase.
