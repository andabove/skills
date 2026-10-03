# Run Effect inside a framework

Reference for [effect-services](../SKILL.md). Checked against `effect 4.0.0`. The glue below was type checked and run against Hono 4.13, Express 5.2, Nitro 2.13 with h3 1.15, and the web-standard `Request` and `Response` that Next.js route handlers use.

## The shape

1. One module builds the app layer and one `ManagedRuntime`, at module scope.
2. Each endpoint is an Effect that returns a framework-neutral result and has no typed errors left: it catches its typed errors and turns them into status codes.
3. The framework handler only calls `runtime.runPromise(effect, { signal })` and converts the result.

The core module, with a service, the runtime and two endpoints:

```ts
// app/effect.ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Schema from "effect/Schema"

export class Todo extends Schema.Class<Todo>("myapp/Todo")({
  id: Schema.String,
  title: Schema.NonEmptyString
}) {}

export class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", { id: Schema.String }) {}

export class Todos extends Context.Service<Todos, {
  find(id: string): Effect.Effect<Todo, TodoNotFound>
  create(title: string): Effect.Effect<Todo>
}>()("myapp/todos/Todos") {
  static readonly layer = Layer.sync(Todos, () => {
    const rows = new Map<string, Todo>()
    return Todos.of({
      find: (id) => {
        const todo = rows.get(id)
        return todo ? Effect.succeed(todo) : Effect.fail(new TodoNotFound({ id }))
      },
      create: (title) =>
        Effect.sync(() => {
          const todo = new Todo({ id: String(rows.size + 1), title })
          rows.set(todo.id, todo)
          return todo
        })
    })
  })
}

export const AppLayer = Layer.mergeAll(Todos.layer)

type AppRuntime = ManagedRuntime.ManagedRuntime<Layer.Success<typeof AppLayer>, Layer.Error<typeof AppLayer>>

// Dev servers re-evaluate this module on reload: reuse the runtime kept on globalThis
// instead of building a second one. Restart the dev server after you change a layer.
const store = globalThis as typeof globalThis & { __appRuntime?: AppRuntime }
export const runtime: AppRuntime = store.__appRuntime ?? ManagedRuntime.make(AppLayer)
if (process.env.NODE_ENV !== "production") store.__appRuntime = runtime

export interface HttpResult {
  readonly status: number
  readonly body: unknown
}

const decodeCreateTodo = Schema.decodeUnknownEffect(Schema.Struct({ title: Schema.NonEmptyString }))

export const getTodo = (id: string): Effect.Effect<HttpResult, never, Todos> =>
  Todos.use((todos) => todos.find(id)).pipe(
    Effect.map((todo): HttpResult => ({ status: 200, body: todo })),
    Effect.catchTag("TodoNotFound", (e) => Effect.succeed({ status: 404, body: { error: `No todo ${e.id}` } }))
  )

export const createTodo: (body: unknown) => Effect.Effect<HttpResult, never, Todos> = Effect.fn("createTodo")(
  function* (body: unknown) {
    const input = yield* decodeCreateTodo(body)
    const todo = yield* Todos.use((todos) => todos.create(input.title))
    return { status: 201, body: todo }
  },
  Effect.catchTag("SchemaError", (e) => Effect.succeed({ status: 400, body: { error: e.message } }))
)
```

The endpoint type `Effect<HttpResult, never, Todos>` is the contract: `never` proves every typed error became a response, and `Todos` is covered by the runtime. When the runtime lacks a service an endpoint needs, `runtime.runPromise` does not type check.

The glue blocks below import `./effect` and a framework package, so they are not compiled by this repository's example checker.

## Next.js (App Router)

```ts nocheck
// app/todos/[id]/route.ts
import { getTodo, runtime } from "@/app/effect"

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  const result = await runtime.runPromise(getTodo(id), { signal: request.signal })
  return Response.json(result.body, { status: result.status })
}
```

```ts nocheck
// app/todos/actions.ts
"use server"
import { createTodo, runtime } from "@/app/effect"

export async function createTodoAction(formData: FormData): Promise<{ readonly ok: boolean; readonly body: unknown }> {
  const result = await runtime.runPromise(createTodo({ title: formData.get("title") }))
  return { ok: result.status < 400, body: result.body }
}
```

- Keep the runtime module server-only. Import it from route handlers, server actions and server components, never from a client component.
- Route handlers in the Edge runtime cannot use Node-only layers. Give them a separate layer and runtime, or run them in the Node.js runtime.

## Hono

```ts nocheck
import { Hono } from "hono"
import { createTodo, getTodo, runtime } from "./effect"

export const app = new Hono()

app.get("/todos/:id", async (c) => {
  const result = await runtime.runPromise(getTodo(c.req.param("id")), { signal: c.req.raw.signal })
  return Response.json(result.body, { status: result.status })
})

app.post("/todos", async (c) => {
  const body: unknown = await c.req.json().catch(() => undefined)
  const result = await runtime.runPromise(createTodo(body), { signal: c.req.raw.signal })
  return Response.json(result.body, { status: result.status })
})
```

## Express 5

Express has no request signal. Make one that aborts when the response closes before it finishes, which means the client went away.

```ts nocheck
import express from "express"
import * as Effect from "effect/Effect"
import { createTodo, getTodo, runtime } from "./effect"

export const app = express()
app.use(express.json())

const disconnectSignal = (res: express.Response): AbortSignal => {
  const controller = new AbortController()
  res.on("close", () => {
    if (!res.writableFinished) controller.abort()
  })
  return controller.signal
}

app.get("/todos/:id", async (req, res) => {
  const result = await runtime.runPromise(getTodo(req.params.id), { signal: disconnectSignal(res) })
  res.status(result.status).json(result.body)
})

app.post("/todos", async (req, res) => {
  const result = await runtime.runPromise(createTodo(req.body), { signal: disconnectSignal(res) })
  res.status(result.status).json(result.body)
})

// build the layers now, so a bad config stops startup instead of failing the first request
await runtime.runPromise(Effect.void)
const server = app.listen(3000)

// stop accepting connections, wait at most 10 seconds for open requests, then dispose
// whether or not they finished: dispose interrupts the runs that are left
const shutdown = async (): Promise<void> => {
  const closed = new Promise<void>((resolve) => server.close(() => resolve()))
  await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 10_000))])
  await runtime.dispose()
  server.closeAllConnections()
  process.exit(0)
}
process.once("SIGTERM", () => void shutdown())
```

Put `runtime.dispose()` after a bounded wait, never only inside `server.close`'s callback. That callback waits for every open request, and a request that never ends (a stream, a long poll, a hung call) then blocks disposal forever.

Express 4 does not forward a rejected promise from an async handler to its error handler. On Express 4, wrap each handler body in `try`/`catch`.

## Nitro (and Nuxt server routes)

This route is for Nitro 2 with h3 1.x on the Node server preset, where `event.node.res` is Node's `ServerResponse`. h3 has no request signal there, so derive one as Express does. Check h3 2 and non-Node presets before you reuse it.

```ts nocheck
// server/routes/todos/[id].get.ts
import type { ServerResponse } from "node:http"
import { defineEventHandler, getRouterParam } from "h3"
import { getTodo, runtime } from "../../effect"

const disconnectSignal = (res: ServerResponse): AbortSignal => {
  const controller = new AbortController()
  res.on("close", () => {
    if (!res.writableFinished) controller.abort()
  })
  return controller.signal
}

export default defineEventHandler(async (event) => {
  const result = await runtime.runPromise(getTodo(getRouterParam(event, "id") ?? ""), {
    signal: disconnectSignal(event.node.res)
  })
  return Response.json(result.body, { status: result.status })
})
```

```ts nocheck
// server/plugins/effect-runtime.ts
import { defineNitroPlugin } from "nitropack/runtime"
import { runtime } from "../effect"

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("close", () => runtime.dispose())
})
```

## A route that answers with a stream

The handler's run covers the program until it returns. A route that answers with a stream returns before the stream ends, so the request's signal and the error mapping of the run do not reach the work that the stream drives. Split that work by what a close must do to it:

- The setup (read the input, start the call) is the program that the handler runs with the request's signal.
- A call that the stream drives, such as a model call, takes the request's signal too, so a close stops it.
- A save that must survive a close runs on the runtime with no signal. Run it through `runtime.run*`, so that `dispose()` reaches it.
- The SDK stream itself is not a run of the runtime. Only the request's signal reaches it, and `dispose()` does not stop it.
- No run answers a fault after the first byte. The work logs its own fault and ends the stream with an error code.

The Nitro sketch below was not run, unlike the glue above. `disconnectSignal` is the helper of the Nitro route above, moved into the shared module. `streamModel` stands for a streaming SDK that calls `onFinish` with the text so far when the stream ends or aborts.

```ts nocheck
// server/routes/reply.post.ts
import { defineEventHandler, readBody } from "h3"
import { disconnectSignal, logFault, runtime, saveReply, startReply, streamModel } from "../effect"

export default defineEventHandler(async (event) => {
  const signal = disconnectSignal(event.node.res)
  // 1. The setup, on the request's signal. It ends when the call can start.
  const reply = await runtime.runPromise(startReply(await readBody(event)), { signal })
  return streamModel({
    prompt: reply.prompt,
    // 2. The call that the stream drives stops on a close.
    abortSignal: signal,
    // 3. The save runs with no signal, so a close does not stop it.
    onFinish: (text: string) => runtime.runPromise(saveReply(reply.id, text)).catch(logFault)
  })
})
```

## Request-scoped values

Per-request data (a request id, the signed-in user) is not a layer. Build it in the handler and attach it with `Effect.provideService`, which costs nothing per request.

```ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"

export class RequestId extends Context.Service<RequestId, string>()("myapp/http/RequestId") {}

const handle = Effect.gen(function* () {
  const requestId = yield* RequestId
  yield* Effect.log(`handling ${requestId}`)
  return { status: 200, body: { requestId } }
})

const runtime = ManagedRuntime.make(Layer.empty)

export async function GET(request: Request): Promise<Response> {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID()
  const result = await runtime.runPromise(handle.pipe(Effect.provideService(RequestId, requestId)), {
    signal: request.signal
  })
  return Response.json(result.body, { status: result.status })
}
```

Provide the signed-in user the same way, but build it only from a verified principal: a session your server looked up, or a token whose signature you checked. A header such as `x-user-id` comes from the client, and anyone can set it. Trust an identity header only from an authenticated proxy that strips the client's copy.

## Startup and shutdown

- A `ManagedRuntime` builds its layers at the first run. Await `runtime.runPromise(Effect.void)` before the server listens, so a missing config value or an unreachable dependency stops startup.
- A server you start: on SIGTERM, stop accepting connections, wait a bounded time for open requests, then `await runtime.dispose()` whether or not they finished. Dispose interrupts runs still in flight, then closes the layers.
- Nitro: dispose in the `close` hook, as above.
- Dispose interrupts only the runs that the runtime made. Work started with `Effect.runPromiseExitWith(await runtime.context())`, or any other run, is not on the runtime's fibers. It runs on past the stop with closed layers. Measured on 4.0.0: of two 100 ms runs disposed at 20 ms, the `runtime.runPromiseExit` run ended interrupted, and the `runPromiseExitWith(context)` run ran to its end after its layer's release had run. Run a socket's session or other long-lived work through `runtime.run*`.
- Serverless and Next.js: the platform can freeze or stop the process without a signal. Use resources that survive an abrupt end, such as pooled connections with idle timeouts, and do not depend on finalizers for correctness.

## Traps

- A runtime per request builds every layer per request: new pools, new clients. So does `Effect.provide(handler, layer)` per request for any layer the runtime did not already build.
- `runtime.runSync` fails with an `AsyncFiberError` defect when the effect is asynchronous. In async handlers use `runPromise`.
- A typed failure that reaches `runPromise` rejects the promise with the error value, and the framework answers 500. Catch typed errors inside the endpoint effect, so its error type is `never`.
- An aborted run rejects too, and so does every run when the layer build fails. The client is gone in the first case; let the framework's error handler drop it.
- Two runtimes over the same layer build it twice. When two runtimes must share built layers (for example two entry bundles), pass one `Layer.makeMemoMapUnsafe()` as `{ memoMap }` to both.
