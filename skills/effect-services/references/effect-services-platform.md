# Platform services and runMain

Reference for [effect-services](../SKILL.md). Checked against `effect 4.0.0`, `@effect/platform-node 4.0.0` and `@effect/platform-bun 4.0.0`. The service keys live in `effect` (`node_modules/effect/src/FileSystem.ts`, `Path.ts`, `Terminal.ts`); the implementations live in the platform packages.

## Keys in `effect`, implementations at the edge

Code depends on a key from `effect`. The entry point provides the platform layer once.

| Key | Purpose |
| --- | --- |
| `FileSystem.FileSystem` | read, write, stat, stream, watch files; scoped temp files and directories |
| `Path.Path` | `join`, `resolve`, `relative`, `basename`, `extname` and the rest of the path API |
| `Terminal.Terminal` | `display(text)` and `readLine` on standard input and output |
| `Stdio.Stdio`, `Crypto.Crypto`, `ChildProcessSpawner` (`effect/process`) | standard streams, crypto, child processes |

| Package | Layer with every service | Entry point |
| --- | --- | --- |
| `@effect/platform-node` (Node.js and Deno) | `NodeServices.layer` | `NodeRuntime.runMain` |
| `@effect/platform-bun` | `BunServices.layer` | `BunRuntime.runMain` |

`NodeServices.layer` provides `ChildProcessSpawner`, `Crypto`, `FileSystem`, `Path`, `Stdio` and `Terminal`. Provide a single one with `NodeFileSystem.layer`, `NodePath.layer` or `NodeTerminal.layer`. `Path.layer` in `effect` is a POSIX implementation with no platform package.

## FileSystem

```ts
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Path } from "effect"

export const writeReport = Effect.fn("writeReport")(function* (lines: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const dir = yield* fs.makeTempDirectoryScoped()
      const file = path.join(dir, "report.txt")
      yield* fs.writeFileString(file, lines.join("\n"))
      return (yield* fs.readFileString(file)).length
    })
  )
  // the temp directory is deleted here
})

export const main = writeReport(["a", "b"]).pipe(Effect.provide(NodeServices.layer))
```

- Operations fail with `PlatformError`. Its `reason._tag` tells the cause, for example `"NotFound"` for a missing file.
- `makeTempDirectoryScoped`, `makeTempFileScoped` and `open` tie the resource to the current scope.
- `stream(path)` and `sink(path)` give a `Stream` and a `Sink`; see [effect-streams](skill:effect-streams).

## Fakes in tests

`FileSystem.layerNoop(overrides)` gives a `FileSystem` in which you implement only the methods the test calls. Of the rest, `exists` returns `false`, reads and writes fail with a `NotFound` `PlatformError`, `remove` succeeds, and some methods such as `makeDirectory` and the temp-file methods die with `not implemented`. Override every method the code under test calls.

```ts
import { Effect, FileSystem } from "effect"

const FakeFs = FileSystem.layerNoop({
  readFileString: (path) => Effect.succeed(`contents of ${path}`)
})

export const test = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  return yield* fs.readFileString("/etc/app.conf")
}).pipe(Effect.provide(FakeFs))
```

## runMain

`NodeRuntime.runMain(effect, options?)` runs a program with no remaining requirements as the process entry point.

- On SIGINT or SIGTERM it interrupts the program, runs every finalizer, then exits with code 130.
- On failure it logs the cause and exits with code 1. On success it does not call `process.exit`: the process ends when nothing else, such as an open server or a timer, keeps it alive.
- `{ disableErrorReporting: true }` stops the error log when the app reports errors itself.
- `{ teardown }` replaces the default exit-code policy with `(exit, onExit) => void`.

```ts
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Path } from "effect"

const main = Effect.gen(function* () {
  const path = yield* Path.Path
  yield* Effect.log(path.join("tmp", "file.txt"))
})

NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)))
```

For a long-running app built as layers, run `NodeRuntime.runMain(Layer.launch(AppLayer))`.

## Logging to a file

`Logger.toFile(path)` turns a string logger into one that writes to a file through `FileSystem`. Logger setup belongs to [effect-observability](skill:effect-observability).
