# Config in depth

Reference for [effect-services](../SKILL.md). Checked against `effect 4.0.0`; the source is `node_modules/effect/src/Config.ts` and `ConfigProvider.ts`.

## The model

- A `Config<A>` describes how to read and decode a value. It is an Effect, so `yield* config` works inside `Effect.gen`, and its failure type is `ConfigError`.
- A `ConfigProvider` supplies raw values. The current provider is a `Context.Reference`. Its default is `ConfigProvider.fromEnv()`, created at the first config read from a copy of `process.env` merged with `import.meta.env`. Variables set after that read are not seen.
- `config.parse(provider)` reads against one provider without installing it. Use it in tests and scripts.

## Constructors

Each takes the key name as its last argument.

| Constructor | Decodes to | Notes |
| --- | --- | --- |
| `Config.String(name)` | `string` | |
| `Config.NonEmptyString(name)` | `string` | rejects `""` when empty strings are preserved |
| `Config.Finite(name)` | `number` | rejects `NaN` and `Infinity`. Prefer it to `Config.Number`. |
| `Config.Number(name)` | `number` | accepts `"NaN"` |
| `Config.Int(name)` | `number` | integer |
| `Config.Port(name)` | `number` | integer from 1 to 65535 |
| `Config.Boolean(name)` | `boolean` | `true false yes no on off 1 0 y n`, lowercase only |
| `Config.Literal(value, name)`, `Config.Literals(values, name)` | a literal union | |
| `Config.Duration(name)` | `Duration` | for example `"5 seconds"` |
| `Config.Date(name)`, `Config.URL(name)` | `Date`, `URL` | |
| `Config.LogLevel(name)` | `LogLevel` | |
| `Config.ByteSize(name)` | `ByteSize` | |
| `Config.Redacted(name)` | `Redacted<string>` | prints as `<redacted>` |
| `Config.Array(schema, name)` | `ReadonlyArray<A>` | a structured array, or one comma-separated string |
| `Config.Record(key, value, name)` | a record | a structured object, or one `k=v,k2=v2` string |
| `Config.schema(schema, name)` | `schema.Type` | any `Schema` codec; see below |
| `Config.succeed(value)` | | a constant |

## Combinators

| Combinator | Effect |
| --- | --- |
| `Config.all({ a, b })` or `Config.all([a, b])` | combine; keeps the shape |
| `Config.nested(config, "DB")` | prefix every key: `DB_HOST` |
| `Config.withDefault(config, value)` | use `value` when the key is absent or empty. An invalid value still fails. |
| `Config.option(config)` | `Option.none()` when absent |
| `Config.orElse(config, () => other)` | try `other` after any `ConfigError`, bad input included |
| `Config.map(config, f)` | transform the value; `f` cannot fail |
| `Config.mapEffect(config, f)` | transform with an effect that can fail with `ConfigError` |

All of them also work in a pipe: `Config.Port("PORT").pipe(Config.withDefault(8080))`.

## Validate with Schema

`Config.schema` reads a structured value and decodes it with any schema. The provider supplies the encoded side.

```ts
import { Config, ConfigProvider, Effect, Schema } from "effect"

const Server = Config.schema(
  Schema.Struct({
    host: Schema.NonEmptyString,
    port: Schema.FiniteFromString.check(Schema.isBetween({ minimum: 1, maximum: 65535 }))
  }),
  "server"
)

// keys are used as written: server_host, server_port
export const fromLowercaseEnv = Server.parse(
  ConfigProvider.fromEnv({ env: { server_host: "localhost", server_port: "8080" } })
)

// constantCase maps server.host to SERVER_HOST
export const fromUppercaseEnv = Server.parse(
  ConfigProvider.fromEnv({ env: { SERVER_HOST: "localhost", SERVER_PORT: "8080" } }).pipe(ConfigProvider.constantCase)
)

export const both = Effect.all([fromLowercaseEnv, fromUppercaseEnv])
```

To decode a secret, wrap the schema: `Config.schema(Schema.RedactedFromValue(Schema.String), "TOKEN")`.

## Providers

| Constructor | Source |
| --- | --- |
| `ConfigProvider.fromEnv()` | `process.env` merged with `import.meta.env`. `fromEnv({ env })` uses only the record you pass. |
| `ConfigProvider.fromEnvRecord(record)` | an explicit record, for runtimes without `process` |
| `ConfigProvider.fromUnknown(value)` | a JavaScript object or parsed JSON. Object keys and array indexes are path segments. |
| `ConfigProvider.fromDotEnvContents(text)` | the text of a `.env` file |
| `ConfigProvider.fromDotEnv({ path })` | a `.env` file, read through `FileSystem`; returns an Effect |
| `ConfigProvider.fromDir({ rootPath })` | a directory tree, one file per value, such as mounted Kubernetes secrets; needs `FileSystem` and `Path` |
| `ConfigProvider.make(lookup)` | a custom source |

- Env-style providers split variable names on `_` and treat an empty string as absent. Pass `{ preserveEmptyStrings: true }` when `""` is a real value.
- `ConfigProvider.nested(provider, "APP")` prefixes every lookup. `ConfigProvider.constantCase(provider)` converts each path segment to `CONSTANT_CASE`. `ConfigProvider.mapInput(provider, f)` rewrites paths.
- `ConfigProvider.orElse(primary, fallback)` asks `fallback` only for paths that `primary` does not have. It does not recover from invalid values.

## Install a provider

- `ConfigProvider.layer(provider)` replaces the provider for everything it is provided to. It also accepts an Effect that returns a provider, such as `ConfigProvider.fromDotEnv()`.
- `ConfigProvider.layerAdd(provider)` keeps the current provider and adds `provider` as a fallback. Pass `{ asPrimary: true }` to consult it first.

```ts
import { NodeServices } from "@effect/platform-node"
import { ConfigProvider, Effect, Layer } from "effect"

// .env values first, then the process environment; no .env file means no extra values
export const DotEnvFirst = ConfigProvider.layerAdd(
  ConfigProvider.fromDotEnv().pipe(Effect.orElseSucceed(() => ConfigProvider.fromUnknown({}))),
  { asPrimary: true }
).pipe(Layer.provide(NodeServices.layer))
```

`fromDotEnv` fails with a `PlatformError` when the file is missing, so the fallback keeps a production start without `.env` working. Provide such a layer to the layers that read config, for example `AppLayer.pipe(Layer.provide(DotEnvFirst))`.

## Errors

A failed read is a `ConfigError` whose message wraps the schema error and names the path, for example `SchemaError(Expected string\n  at ["HOST"])` for a missing `HOST`. Read config in layers, so this error stops the app at startup and names the key.

## Tests

```ts
import { Config, ConfigProvider, Effect } from "effect"

const Port = Config.Port("PORT").pipe(Config.withDefault(8080))

// one config against one provider
export const parsed = Port.parse(ConfigProvider.fromUnknown({ PORT: 3000 }))

// a whole program against a fixed provider
export const program = Effect.gen(function* () {
  return yield* Port
}).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ PORT: 3000 }))))
```
