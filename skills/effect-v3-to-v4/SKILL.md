---
name: effect-v3-to-v4
description: Effect v3 to v4 migration. Use when you upgrade `effect` or any `@effect/*` package from 3.x to 4.x, when you fix code or docs that use Effect 3 API names, or when you review a v4 migration.
---

# Effect v3 to v4 Migration

Checked against `effect` 4.0.0 (git tag `effect@4.0.0`, commit `67ba4e46a11c`). When the project targets a newer 4.x, use that version's tag in every command below.

Drive an Effect v3 to v4 migration from the generated migration reference that ships in the Effect repo, and confirm each answer in the v4 source. Every rename, removal, and signature change is answered by upstream data and the source - do not guess replacements.

## Workflow

Work through these steps in order; each one is detailed in the section named.

1. **Set up and validate the local checkouts** - two shallow clones pinned to release tags; verify any pre-existing `.repos/effect` before trusting it. See **Setup: Local Checkouts**.
2. **Read `MIGRATION.md`** and `ls .repos/effect/migration/` for the background and guide index. See **Reading Order**.
3. **Migrate `package.json`** - remove consolidated packages, align every remaining Effect package on one v4 version. Do this before type-checking, or the first run drowns in unresolved-import noise from packages that no longer exist. See **Repo-Level Changes**.
4. **Run the project's type-check** (e.g. `tsc --noEmit`) to get the initial error inventory.
5. **Iterate until the type-check is clean.** For each error, resolve the API through the lookup discipline - check **The renames you meet most** first, then search `migration/v3-to-v4.md` for the symbol, escalate per **Reading Order** - then fix the call site, delegating per-file fixes to sub-agents per **Delegating to Sub-Agents**. Never silence an error instead of resolving it; see **Hard Prohibitions**.
6. **Fix the runtime changes the type-check cannot see.** See **Changes that still compile**.
7. **Finish** - type-check clean; run tests and report their outcome honestly (not a gate); write the final summary. See **Done Condition**.

## Setup: Local Checkouts

The migration is driven from two shallow, single-branch clones of the canonical Effect repo, each pinned to a release tag:

```sh
git clone --depth 1 --single-branch --branch effect@4.0.0 https://github.com/Effect-TS/effect .repos/effect
git clone --depth 1 --single-branch --branch effect@3.22.2 https://github.com/Effect-TS/effect .repos/effect-v3
```

- `.repos/effect` - v4 at the version you migrate to. Contains `MIGRATION.md`, the `migration/` guides, and the v4 source.
- `.repos/effect-v3` - v3 at the version the project uses now (read it from the lockfile; `3.22.2` is the last v3 release on 2026-10-01). Escalation-only reference for old semantics.
- Add `.repos/` to `.gitignore`.

Each clone is independently re-runnable and separately deletable. Do not use `git worktree` to share one clone between branches. Do not clone `main`: it moves past the release you install, and its source and guides can describe APIs that your version does not have.

### Validate an existing checkout before trusting it

`./.repos/effect` may already exist, cloned from the archived `Effect-TS/effect-smol` repo by older setup instructions. That checkout is dead: it is stale and does not contain `migration/v3-to-v4.md`. A clone of `main` from the same instructions is not pinned to your version. Verify before using:

```sh
git -C .repos/effect remote get-url origin   # must be the canonical Effect-TS/effect repo
git -C .repos/effect describe --tags          # must be the effect@4.x tag you install
test -f .repos/effect/migration/v3-to-v4.md   # must exist
```

If the origin points at `effect-smol`, the tag is not the version in the lockfile, or the reference file is missing, delete the directory and re-clone as above.

## Reading Order

1. **Front-load `MIGRATION.md` once** (`.repos/effect/MIGRATION.md`).
2. **The renames table below**, for the names that most v3 code uses. Each entry was checked against the 4.0.0 source.
3. **`migration/v3-to-v4.md` - the first stop for every other API.** The generated reference covers every removed or changed API. Search it (see below); never read it whole.
4. **A per-topic guide** (`.repos/effect/migration/*.md`) when the mapping implies a rewrite rather than a rename - e.g. `Context.Tag` to `Context.Service` is a structural change, not a symbol swap. Reach these on demand from the `MIGRATION.md` index, not front-loaded.
5. **v4 source** (`.repos/effect/packages/*/src/`) to confirm a replacement's real signature before writing code against it. The source wins over the reference and the guides: see **Where the docs disagree with 4.0.0**.
6. **v3 source** (`.repos/effect-v3`) as escalation only - for when unsure about the old v3 semantics.

## Never Read the Reference Doc Whole

**This is the single most important rule in this skill.** `migration/v3-to-v4.md` is about 16,800 lines at `effect@4.0.0`. Reading it in one pass blows the context window and takes the migration with it.

Always search it and read only matched lines plus surrounding context. The file has four sections - **Import Map**, **No Counterpart Imports**, **Removed Modules**, and **API Reference** (one `` ### `<v3 module path>` `` heading per module). Entries are grep-able one-liners of the form `` - `Old.symbol` -> `New.symbol`: <rationale> ``, and removals are explicit `` -> `none` `` entries with a stated alternative.

Concrete recipes:

```sh
# Look up a specific v3 symbol
rg -n 'Effect\.catchSomeDefect' .repos/effect/migration/v3-to-v4.md

# Read a whole module's section via its heading
rg -n -A 40 '^### `@effect/platform/FileSystem`' .repos/effect/migration/v3-to-v4.md

# Resolve a v3 import path in the Import Map
rg -n '^@effect/platform/FileSystem ' .repos/effect/migration/v3-to-v4.md

# List every module section for a package
rg -n '^### `@effect/cluster/' .repos/effect/migration/v3-to-v4.md

# Confirm the target exists in the v4 source before you use it
rg -n '^export (const|function|type|interface|class) catchFilter\b' .repos/effect/packages/effect/src/Effect.ts
```

Look up APIs as you encounter them, one search at a time. A miss in the Import Map is not a dead end - check the **Removed Modules** and **No Counterpart Imports** sections before concluding anything. The reference was generated from a commit before the release tag (its header names commit `072cdc42`, which is not in the published history), so confirm each target in the v4 source.

## The renames you meet most

Each v4 name below was checked in the 4.0.0 source and type checked in use. The full map, grouped by module, with the v3 names that the reference misses: [references/effect-v3-to-v4-renames.md](references/effect-v3-to-v4-renames.md).

| v3 | v4 |
| --- | --- |
| `Effect.catchAll`, `catchAllCause`, `catchAllDefect` | `Effect.catch`, `catchCause`, `catchDefect` |
| `Effect.catchSome`, `catchSomeCause` | `Effect.catchFilter`, `catchCauseFilter` (take a `Filter`, not an `Option`-returning function) |
| `Effect.catchSomeDefect` | removed: `Effect.catchDefect`, and `Effect.die` again for defects you do not handle |
| `Effect.catch(discriminator, { failure, onFailure })` | `Effect.catchTag` for `_tag`, `Effect.catchIf` for another field; v4 `Effect.catch` takes only a handler |
| `Effect.either` | `Effect.result` |
| `Effect.fork`, `forkDaemon` | `Effect.forkChild`, `forkDetach` |
| `Effect.zipRight`, `zipLeft` | `Effect.andThen`, `Effect.tap` |
| `Effect.tapErrorCause` | `Effect.tapCause` |
| `Effect.async`, `asyncEffect` | `Effect.callback` |
| `Effect.fromNullable` | `Effect.fromNullishOr` |
| `Effect.optionFromOptional` | `Effect.catchNoSuchElement` |
| `Effect.orElse(() => fallback)` | `Effect.catch(() => fallback)` |
| `Effect.orElseFail(() => e)` | `Effect.mapError(() => e)` |
| `Effect.timeoutFail`, `timeoutTo` | `Effect.timeoutOrElse({ duration, orElse })` |
| `Effect.dieMessage(m)` | `Effect.die(new Error(m))` |
| `Effect.ignoreLogged` | `Effect.ignoreCause({ log: "Debug" })` (the reference's `Effect.ignore({ log: true })` lets defects through) |
| `Effect.makeSemaphore`, `makeLatch` | `Semaphore.make`, `Latch.make` |
| `Effect.withConcurrency` | removed: pass `{ concurrency }` to each `all`, `forEach` or stream operator |
| `Effect.gen(this, function*() {})` | `Effect.gen({ self: this }, function*() {})` |
| `Context.Tag`, `Context.GenericTag`, `Effect.Tag` | `Context.Service<Self, Shape>()("id")`, or `Context.Service<Shape>("id")` |
| `Effect.Service` with `effect` and `dependencies` | `Context.Service<Self>()("id", { make })` plus your own `static layer = Layer.effect(this, this.make).pipe(Layer.provide(...))` |
| `MyService.method(...)` (a `Tag` accessor) | `MyService.use((s) => s.method(...))`, or `yield* MyService` |
| `FiberRef.currentLogLevel` and the other built-in `FiberRef`s | `References.CurrentLogLevel` and the rest of `References` |
| `Effect.locally(effect, ref, value)` | `Effect.provideService(effect, Reference, value)` |
| `Runtime<R>`, `Effect.runtime<R>()`, `Runtime.runFork(rt)` | `Context<R>`, `Effect.context<R>()`, `Effect.runForkWith(context)` |
| `Layer.scoped`, `scopedDiscard` | `Layer.effect`, `effectDiscard` |
| `Layer.fail(e)` | `Layer.effectDiscard(Effect.fail(e))` (the reference's `Layer.unwrap(Effect.fail(e))` types `E` and `R` as `unknown`) |
| `Logger.replace(Logger.defaultLogger, l)` | `Logger.layer([l])` |
| `Either.right`, `left`, `Right`, `Left`, `isRight`, `isLeft` | `Result.succeed`, `fail`, `Success`, `Failure`, `isSuccess`, `isFailure` |
| `Cause.isFailType`, `isDieType`, `isInterruptType` | `Cause.isFailReason`, `isDieReason`, `isInterruptReason`, applied to each of `cause.reasons` |
| `Cause.failureOption`, `failureOrCause`, `dieOption` | `Cause.findErrorOption`, `findError`, `findDefect` |
| `Cause.sequential`, `parallel` | `Cause.combine` |
| `Cause.NoSuchElementException`, `TimeoutException`, `UnknownException` | `Cause.NoSuchElementError`, `TimeoutError`, `UnknownError` |
| `Exit.causeOption` | `Exit.getCause` |
| `Scope.extend` | `Scope.provide` |
| `Equal.equivalence` | `Equal.asEquivalence` |
| `Schedule.union`, `intersect` | `Schedule.min([a, b])`, `Schedule.max([a, b])` (take an array) |
| `Stream.async`, `asyncEffect`, `asyncScoped`, `asyncPush` | `Stream.callback` |
| `effect/unstable/http` and other `effect/unstable/*` imports | `effect/http`, `effect/rpc`, ... (see **Repo-Level Changes**) |

Removed APIs with no counterpart, listed by module: [references/effect-v3-to-v4-removed.md](references/effect-v3-to-v4-removed.md).

## Changes that still compile

These compile after the rename, and behave differently. Check each one where the project relies on it:

- **`Equal.equals` compares plain objects, arrays, `Map`s and `Set`s by value**, and `NaN` equals `NaN`. v3 compared plain objects by reference. Code that relies on two equal-looking objects being different, for example as `HashMap` keys, changes behaviour. Wrap such a value in `Equal.byReference`.
- **A layer provided again inside an effect that already provides it is not rebuilt.** `effect.pipe(Effect.provide(L), Effect.provide(L))` builds `L` once (v3 built it twice). Two sibling `Effect.provide(x, L)` calls in sequence still build it twice, since the first scope closes before the second build. For a second instance in the nested case, use `Layer.fresh(layer)`.
- **`Effect.runSync` and `Effect.runPromise` throw the failure itself**, not a `FiberFailure` wrapper. `Effect.runSync(Effect.fail("boom"))` throws the string `"boom"`, so `error.message` is `undefined`. Use `Effect.runPromiseExit` where the caller must inspect the failure.
- **`ignoreLogged` swallowed defects and interruptions.** v4 `Effect.ignore` handles failures only, so a defect that v3 ignored now fails the effect. Code that relied on it to keep a background loop alive needs `Effect.ignoreCause({ log: "Debug" })`, which also matches v3's Debug log level.
- **`Schema.Symbol` and `TxSubscriptionRef.changes` keep their names with new behaviour.** The reference lists both as removed. `Schema.Symbol` is now the schema of `symbol` values, without a string codec; `TxSubscriptionRef.changes` is scoped.
- **A process that only waits can exit.** Neither v3 nor 4.0.0 keeps Node alive for a fiber that waits on a `Deferred` or a `Queue` under `Effect.runPromise`. Keep `NodeRuntime.runMain` as the entry point.

## Where the docs disagree with 4.0.0

The guides and the reference were written before the release. In 4.0.0:

- **`Option` and `Result` are not yieldable in `Effect.gen`**, and have no `.asEffect()`. `yield* Option.some(1)` fails to type check and dies at runtime with `Not a valid effect`. `migration/yieldable.md` says the opposite. Use `yield* Effect.fromOption(option)` and `yield* Effect.fromResult(result)`.
- **The core runtime does not keep the process alive.** `migration/fiber-keep-alive.md` says it does; its own example exits on its own with code 0. Only `runMain` holds the process open.
- **`Effect.provide(layer, { local: true })` on the outer call does not rebuild the layer.** The `layer-memoization.md` example builds once, not twice. Use `Layer.fresh` when you need a second build.
- **Reference targets that do not exist:** `Option.fromNullable` (for `Effect.fromNullable`; use `Effect.fromNullishOr`), `Effect.orElse` (for `ParseResult.orElse`), `Schema.mapFields` as a module export (it is a method on struct schemas), `TxRef.isTxRef`, `Scope.ExecutionStrategy`, `Fiber.Variance` and `Sink.Variance` (they are `Fiber.Fiber.Variance` and `Sink.Sink.Variance`), and four targets marked internal in the source.
- **161 v3 names have no entry in the reference**, for example `Effect.Semaphore` (now `Semaphore.Semaphore`), `Clock.sleep` (now `Effect.sleep`) and `Metric.trackDuration` (now `Effect.trackDuration`).

Every finding, with the reference line number and how it was checked: [references/effect-v3-to-v4-errata.md](references/effect-v3-to-v4-errata.md).

## Repo-Level Changes

Faithful per-API lookup alone still yields a broken `package.json`. Handle these once, up front:

- **Package consolidation.** `@effect/platform`, `@effect/rpc`, `@effect/cluster`, and others merged into the core `effect` package - remove them from `package.json` and rewrite their imports per the Import Map. Packages that remain separate (`@effect/platform-*`, `@effect/sql-*`, `@effect/ai-*`, `@effect/opentelemetry`, `@effect/atom-*`, `@effect/vitest`) stay as dependencies.
- **Version alignment.** All Effect ecosystem packages share one version number in v4. Every remaining `effect` / `@effect/*` dependency must be on the same matching version. Install from the `latest` dist-tag: on 2026-10-01 `rc` points to `4.0.0-rc.118`, older than `latest` (`4.0.0`).
- **Unstable modules have no `unstable` segment.** Some functionality is marked `@stability unstable` (it may break in minor releases) and lives under paths such as `effect/http`, `effect/rpc` and `effect/ai/LanguageModel`. Import paths with `effect/unstable/...` were removed before 4.0.0 and have no compatibility export; replace `effect/unstable/http` with `effect/http`.

## Delegating to Sub-Agents

Per-file migration work is context-hungry; do it in sub-agents so the main session's context survives the whole migration.

- Spawn one sub-agent per file (or per module), giving it the specific v3 symbols to resolve in that file.
- The sub-agent returns the edit and the mappings it used; the main session keeps the error inventory and the running summary.
- Sub-agents inherit the same lookup discipline (**Reading Order**, the `rg` recipes) and **Hard Prohibitions**.
- The reference doc is never read whole in a sub-agent either - a blown sub-agent context still costs the migration that file.

## Hard Prohibitions

- **Never reintroduce a v3-shaped compatibility layer.** Writing a `v3-compat.ts` that re-exports old names makes type errors vanish and permanently freezes the codebase between versions. Migrate call sites to the v4 API.
- **No `any`, no `as` casts** to silence a post-migration type error. Such an error is usually evidence the replacement has a different shape; casting deletes that information. Go back to the reference or the v4 source.
- **No invented APIs.** Every replacement must trace to the reference doc, a topic guide, or the v4 source, and must exist in the v4 source.

## Done Condition

**The project type-checks against v4.** A v4 migration is mostly a type-level exercise; unresolved imports and changed signatures surface there. Run the project's type-check (e.g. `tsc --noEmit`) until clean. The changes in **Changes that still compile** do not surface there, so check each one.

Running the test suite is recommended, and its outcome must be reported honestly - but it is **not** a gate. A repo mid-migration often has tests that cannot run for unrelated reasons; do not weaken tests to make them pass.

The final summary must state: the type-check result, the test result (or why tests were not run), every constructed replacement, each runtime change checked, and any gaps that were reported rather than bridged.
