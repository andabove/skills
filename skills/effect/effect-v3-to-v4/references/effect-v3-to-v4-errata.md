# Where the v4 migration docs disagree with 4.0.0

Checked on 2026-10-01 against `effect` 4.0.0 from npm and the Effect repository at tag `effect@4.0.0` (commit `67ba4e46a11c`). Each finding was checked by type checking or running code against 4.0.0, or by reading the cited source line. Re-check these when you migrate to a later 4.x: a later release can fix the doc or change the code.

## migration/yieldable.md

- **Claim:** `Option` and `Result` implement `Yieldable`, so `yield* Option.some(42)` works in `Effect.gen`, and `.asEffect()` converts them for combinators.
- **4.0.0:** neither is yieldable in `Effect.gen`. The code fails to type check (an `Option` is not an `Effect`), and at runtime the fiber dies with the defect `Fiber.runLoop: Not a valid effect: some(42)`. `Option.some(42).asEffect` is `undefined`. Their `[Symbol.iterator]` serves `Option.gen` and `Result.gen` only.
- **Write instead:** `yield* Effect.fromOption(option)` (fails with `Cause.NoSuchElementError`) and `yield* Effect.fromResult(result)`.

## migration/fiber-keep-alive.md

- **Claim:** the core runtime keeps the Node process alive while a fiber waits, so `Effect.runPromise(program)` with a pending `Deferred.await` does not exit.
- **4.0.0:** the guide's own example exits by itself with code 0 (about 300 ms after start, process start included); the same holds for `Queue.take`. The only keep-alive timer is in `Runtime.makeRunMain` (`src/Runtime.ts`, the `setInterval` in `makeRunMain`). `NodeRuntime.runMain(program)` stayed alive in the same test.
- **Write instead:** run processes with `NodeRuntime.runMain` or `BunRuntime.runMain`.

## migration/layer-memoization.md

- **Claim:** `program.pipe(Effect.provide(layer), Effect.provide(layer, { local: true }))` builds the layer twice.
- **4.0.0:** it builds once. `Effect.provide(layer, { local: true })` as the inner provide, with a plain provide outside, builds twice. `Layer.fresh(layer)` on the outer provide builds twice.
- **Write instead:** `Layer.fresh` when you need a second instance.

## migration/runtime.md

- **Claim:** the `Runtime` module only contains `Teardown`, `defaultTeardown` and `makeRunMain`.
- **4.0.0:** it also exports `errorExitCode`, `getErrorExitCode`, `errorReported` and `getErrorReported`, which set a process exit code and turn off the error report for one error class.

## MIGRATION.md

- **Claim:** the unstable modules include `jsonschema`.
- **4.0.0:** `effect/jsonschema` is not in the package's `exports`. The unstable folders are `ai`, `cli`, `cluster`, `devtools`, `encoding`, `eventlog`, `http`, `http-api`, `net`, `observability`, `persistence`, `process`, `reactivity`, `rpc`, `schema`, `socket`, `sql`, `workflow` and `workers`; the guide leaves out `encoding` and `net`.

## migration/schema.md

- The `Number.parse` example compares the result with `undefined`, but `Number.parse` returns an `Option`, so the check never fires.

## migration/v3-to-v4.md

The header names commit `072cdc42a844`, which is not in the published repository history, so the file was generated from a commit before the tag. `effect/Arbitrary` has no Import Map line.

Targets that do not exist in 4.0.0 (line numbers at `effect@4.0.0`):

| Line | v3 | Reference target | 4.0.0 |
| --- | --- | --- | --- |
| 9949 | `Effect.fromNullable` | `Effect.fromOption` + `Option.fromNullable` | no `Option.fromNullable`; use `Effect.fromNullishOr` |
| 12964 | `ParseResult.orElse` | `Effect.orElse` | no `Effect.orElse`; use `Effect.catch` |
| 10365 | `ExecutionStrategy.ExecutionStrategy` | `Scope.ExecutionStrategy` | not exported |
| 11019, 11021 | `Fiber.Fiber.RuntimeVariance`, `Fiber.Fiber.Variance` | `Fiber.Variance` | the type is `Fiber.Fiber.Variance` |
| 15380 | `Sink.Sink.Variance` | `Sink.Variance` | the type is `Sink.Sink.Variance` |
| 15290, 15292, 15296 | `SchemaAST.omit`, `partial`, `required` | `Schema.mapFields` | a method on struct schemas, not a module export |
| 16423 | `TRef.TRefTypeId` | `TxRef.isTxRef` | not exported |
| 12914 | `ParseResult.TreeFormatter` | `SchemaIssue.defaultFormatter` | marked `@internal` |
| 14926, 15114 | `Schema.parseJson`, `SchemaAST.ParseJsonSchemaId` | `Schema.UnknownFromJsonString` | marked `@internal` |
| 15176 | `SchemaAST.annotations` | `SchemaAST.annotate` | marked `@internal` |
| 15186 | `SchemaAST.defaultParseOption` | `SchemaAST.defaultParseOptions` | marked `@internal` |
| 10901 | `FastCheck.resetConfigureGlobal` | `Undici.install` | an unrelated API; the entry is marked `TODO: needs guidance` |

Six targets are placeholders, not exports: `UrlParamsFromString.pipe` (line 7587), `ServiceRef.get`, `ServiceRef.contextEffect`, `ServiceRef.refresh` (lines 13420 to 13426; `ServiceRef` stands for your own `LayerRef` service) and `CurrentSize.use` (line 16693).

Entries that point the wrong way:

- `Effect.catch` (line 9851) says the name is still exported with a revised signature. The v3 form `Effect.catch(discriminator, { failure, onFailure })` has no v4 overload: v4 `Effect.catch` takes only a handler. Rewrite with `Effect.catchTag` or `Effect.catchIf`.
- `Effect.optionFromOptional` (line 10015) points to `Effect.catchTag`. 4.0.0 has `Effect.catchNoSuchElement`, which does the whole job: `Some` on success, `None` on `NoSuchElementError`.
- `Effect.ignoreLogged` (line 9961) points to `Effect.ignore({ log: true })`. v3 `ignoreLogged` handled every cause and logged at Debug; v4 `Effect.ignore` handles failures only, so a defect now fails the effect, and `{ log: true }` logs at Info. `Effect.ignoreCause({ log: "Debug" })` keeps the v3 behaviour.
- `Layer.fail` (line 11596) points to `Layer.unwrap(Effect.fail(error))`. That compiles, but infers the layer's error and requirements as `unknown`, so `Effect.provide` with it loses the error type. `Layer.effectDiscard(Effect.fail(error))` gives `Layer<never, E>` and fails the same way at runtime.
- `Schema.Symbol` and `TSubscriptionRef.changes` are listed as removed (`-> none`) but 4.0.0 still exports the names, with new behaviour.

211 entries are marked `TODO: needs guidance`, 194 of them for `effect/FastCheck`, which v4 drops: import `fast-check` directly, or use `effect/Arbitrary` for schema-driven samples. 161 v3 exports have no entry at all; the ones with a 4.0.0 candidate are in `effect-v3-to-v4-renames.md`.

## The 4.0.0 source itself

The doc comment of `Effect.runSync` in `src/Effect.ts` says it throws a `FiberFailure`. The code throws `Cause.squash(cause)`: the failure value itself, so `Effect.runSync(Effect.fail("boom"))` throws the string `"boom"`.

## Effect-TS/skills `effect-v3-to-v4` (commit 2309e6f)

- It clones `main`, which has moved past 4.0.0. Pin the clone to the release tag.
- It calls `effect/unstable/http` and `effect/unstable/rpc` correct v4 imports. 4.0.0 removed the `unstable` segment with no compatibility export.
- Its sibling `effect-ts` skill installs `effect@rc`, which on 2026-10-01 is `4.0.0-rc.118`, older than `latest` (`4.0.0`).
