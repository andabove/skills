# Setting up a project for Effect

Checked against `effect` 4.0.0 on 2026-10-01.

## Install

```sh
npm install effect
```

With pnpm, Yarn or Bun use `pnpm add effect`, `yarn add effect` or `bun add effect`; with Deno use `deno add npm:effect`.

- The runtime packages release with `effect` under one version: `@effect/platform-*`, `@effect/sql-*`, `@effect/ai-*`, `@effect/opentelemetry`, `@effect/atom-*` and `@effect/vitest`. Install matching versions: `effect@4.0.0` goes with `@effect/platform-node@4.0.0` and `@effect/vitest@4.0.0`. A mismatch can load two copies of `effect`; `npm ls effect` (or `pnpm why effect`) shows them.
- Tooling is versioned on its own. On 2026-10-01 `@effect/tsgo` is `0.47.2` and `@effect/language-service` is `0.87.3`; neither has a `4.0.0` release, so a blanket "pin every `@effect/*` to 4.0.0" fails to install. Install their own latest and check their compatibility notes.
- Install from the `latest` dist-tag. On 2026-10-01 `latest` is `4.0.0` and `rc` is `4.0.0-rc.118`, an older pre-release. Older guidance that says `effect@rc` now installs a version behind the release.
- Most of what v3 kept in `@effect/platform`, `@effect/rpc`, `@effect/cluster` and similar packages is in `effect` itself in v4 (`effect/http`, `effect/rpc`, ...). The packages that stay separate are platform runtimes (`@effect/platform-node`, `@effect/platform-bun`, `@effect/platform-browser`), SQL drivers (`@effect/sql-*`), AI providers (`@effect/ai-*`), `@effect/opentelemetry` and `@effect/vitest`.

## tsconfig.json

```json
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "skipLibCheck": true
  }
}
```

| Setting | Why |
| --- | --- |
| `strict: true` | The website's install guide and the Effect repository both set it. Without `strictNullChecks`, `null` and `undefined` are assignable to every type, so a missing value is no longer visible in `A`. |
| `exactOptionalPropertyTypes: true` | Effect's own repository builds with it, and its option types declare `\| undefined` where they accept it. Code examples in these skills type check with it. |
| `target` `ES2022` or later | `yield*` on an effect needs `ES2015` or later (or `downlevelIteration`); below that every `yield*` is a type error. |
| `moduleResolution` `NodeNext` or `Bundler` | `effect` resolves through the `exports` map. Under `node10` TypeScript reports `Cannot find module 'effect'`. Use `Bundler` with `"module": "ESNext"` for bundled apps. |

The website names TypeScript 5.9 or later as the minimum, and its Node setup uses a `"type": "module"` package; `effect` ships ES modules only.

## Point the project's agents at the installed docs

The `effect` package ships agent guidance for its exact version. Add this to the project's `AGENTS.md` or `CLAUDE.md`:

```md
## Effect

This project uses Effect 4. Before you write Effect code, read
`node_modules/effect/AGENTS.md` and follow its links that the task needs.
Look up each API in `node_modules/effect/src/<Module>.ts`, the source of the
installed version. Docs for Effect 3 or for a v4 beta use names that this
version does not have.
```

In a monorepo, check that `node_modules/effect` resolves from the folder where the agent works. With pnpm, add `effect` to the root `devDependencies` if it does not.

## Editor and lint tooling

The Effect language service ships as `@effect/tsgo`, a build of the Go-based TypeScript compiler with Effect diagnostics. It reports, among others, effects that are built but never run or yielded, layers whose requirements leak, `catch` on effects that cannot fail, and more than one installed version of `effect`.

- Set it up with `npx @effect/tsgo setup`, or by hand: install `@effect/tsgo` as a dev dependency, add `{ "name": "@effect/language-service" }` to `compilerOptions.plugins`, and add `"prepare": "effect-tsgo patch"` to the scripts. It needs a TypeScript 7 (native) install.
- Once patched, the Effect diagnostics appear in `tsc` output, so an agent sees them in the type check.
- With Oxlint, run `effect-tsgo patch --oxlint` and extend `./node_modules/@effect/tsgo/oxlint-presets/recommended.json`.

Read the `@effect/tsgo` README for the current options before you configure it; this section reflects the website on 2026-10-01, not a run of the tool.

## How the import numbers in SKILL.md were measured

Each sample is a fresh `node` process (Node 24.14.1, effect 4.0.0) that times one `await import(...)` with `performance.now()`. Thirty samples per entry point, after one warm-up run; the table gives the median and the 90th percentile. Module counts come from a `module.registerHooks` resolve hook that records each `effect` file loaded. Bundle sizes come from bundling `Effect.runSync(Effect.succeed(1))` with esbuild 0.28.2 (`--bundle --minify`) and with Rollup 4.63 plus terser, once through the `effect` index and once through `effect/Effect`. Rerun the measurement on the project's machine before you quote it.
