# Schema transformations

Reference for [effect-schema](../SKILL.md). Checked against `effect 4.0.0`; the source is `Schema.ts` (`decodeTo`, `decode`), `SchemaGetter.ts` and `SchemaTransformation.ts` in `node_modules/effect/src/`.

## How decodeTo connects two schemas

`Source.pipe(Schema.decodeTo(Target, transformation))` makes a schema whose `Encoded` is `Source`'s `Encoded` and whose `Type` is `Target`'s `Type`.

- Decoding: `Source` decodes its input, the transformation's `decode` turns `Source.Type` into `Target.Encoded`, then `Target` decodes that.
- Encoding: `Target` encodes, the transformation's `encode` turns `Target.Encoded` into `Source.Type`, then `Source` encodes that.
- When `Source.Type` already equals `Target.Encoded`, omit the transformation: `Source.pipe(Schema.decodeTo(Target))` chains the two schemas.

```ts
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"

const CommaList = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Array(Schema.String),
    SchemaTransformation.transform({
      decode: (s): ReadonlyArray<string> => (s === "" ? [] : s.split(",")),
      encode: (items) => items.join(",")
    })
  )
)

// "1,2,3" -> ["1", "2", "3"] -> [1, 2, 3]
export const NumberList = CommaList.pipe(Schema.decodeTo(Schema.Array(Schema.FiniteFromString)))
```

## Two ways to write the transformation

| Form | Use it when |
| --- | --- |
| `SchemaTransformation.transform({ decode, encode })` | both directions are pure and cannot fail |
| `SchemaTransformation.transformEffect({ decode, encode })` | both directions return an Effect |
| `{ decode: getter, encode: getter }` with `SchemaGetter` functions | each direction needs a different kind of step |

`SchemaGetter` steps:

| Getter | Step |
| --- | --- |
| `SchemaGetter.transform(f)` | pure, cannot fail |
| `SchemaGetter.transformEffect((value, options) => effect)` | can fail with a `SchemaIssue.Issue`, can be async, can use services |
| `SchemaGetter.passthrough()` | the value is already the right type |
| `SchemaGetter.forbidden(() => "reason")` | this direction is not allowed; fails with the reason |
| `SchemaGetter.checkEffect((value) => effect)` | validates with an effect; the effect returns `true` or a message |
| `SchemaGetter.transformOptional((option) => option)` | sees an absent key as `Option.none()` and can add or remove the key |

The website's `SchemaGetter.transformOrFail` does not exist in 4.0.0. Write `SchemaGetter.transformEffect`.

## Fail with an issue

Fail a step with a `SchemaIssue`. `new SchemaIssue.InvalidValue({ message })` is the usual one; its message becomes the `SchemaError` message at that path.

```ts
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaGetter from "effect/SchemaGetter"
import * as SchemaIssue from "effect/SchemaIssue"

const Color = Schema.Literals(["red", "green", "blue"])

export const ColorFromAnyCase = Schema.String.pipe(
  Schema.decodeTo(Color, {
    decode: SchemaGetter.transformEffect((input) => {
      const lower = input.toLowerCase()
      return lower === "red" || lower === "green" || lower === "blue"
        ? Effect.succeed(lower)
        : Effect.fail(new SchemaIssue.InvalidValue({ message: `Unknown color ${input}` }))
    }),
    encode: SchemaGetter.passthrough()
  })
)
```

## Steps that need a service

A service read in a step joins the schema's `DecodingServices` (or `EncodingServices`). `Schema.decodeUnknownEffect` then requires it in `R`, and the Sync, Result and Promise decoders no longer accept the schema.

```ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SchemaGetter from "effect/SchemaGetter"
import * as SchemaIssue from "effect/SchemaIssue"

class Accounts extends Context.Service<Accounts, {
  exists(id: string): Effect.Effect<boolean>
}>()("myapp/Accounts") {}

export const AccountId = Schema.String.pipe(
  Schema.decodeTo(Schema.String.pipe(Schema.brand("AccountId")), {
    decode: SchemaGetter.transformEffect((id) =>
      Accounts.use((accounts) => accounts.exists(id)).pipe(
        Effect.flatMap((found) =>
          found ? Effect.succeed(id) : Effect.fail(new SchemaIssue.InvalidValue({ message: `No account ${id}` }))
        )
      )
    ),
    encode: SchemaGetter.passthrough()
  })
)

// Effect<string & Brand<"AccountId">, SchemaError, Accounts>
export const decoded = Schema.decodeUnknownEffect(AccountId)("acc_1").pipe(
  Effect.provide(Layer.succeed(Accounts, Accounts.of({ exists: (id) => Effect.succeed(id === "acc_1") })))
)
```

`Schema.toStandardSchemaV1` refuses a schema that needs services, because Standard Schema has no way to pass them.

## A check that needs an effect

Use `Schema.decode` with `SchemaGetter.checkEffect` on a schema whose type does not change:

```ts
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaGetter from "effect/SchemaGetter"

declare const isUsernameFree: (name: string) => Promise<boolean>

export const FreeUsername = Schema.String.pipe(
  Schema.decode({
    decode: SchemaGetter.checkEffect((name) =>
      Effect.promise(() => isUsernameFree(name)).pipe(Effect.map((free) => free || `${name} is taken`))
    ),
    encode: SchemaGetter.passthrough()
  })
)
```

## Optional keys

`SchemaGetter.transformOptional` receives the field as an `Option`: `None` when the key is absent. Return `None` to leave the key out of the output.

```ts
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as SchemaGetter from "effect/SchemaGetter"

// accept null or an absent key on the wire; decode both to an absent key
export const Profile = Schema.Struct({
  bio: Schema.optionalKey(Schema.NullOr(Schema.String)).pipe(
    Schema.decodeTo(Schema.optionalKey(Schema.String), {
      decode: SchemaGetter.transformOptional((o) => Option.filter(o, Predicate.isNotNull)),
      encode: SchemaGetter.transformOptional((o) => o)
    })
  )
})
```

For the common cases, use `Schema.OptionFromNullOr`, `Schema.OptionFromOptionalKey` and the rest of that family; see [effect-schema-building-blocks.md](effect-schema-building-blocks.md).

## Built-in transformations

| Schema | Encoded to Type |
| --- | --- |
| `Schema.FiniteFromString`, `Schema.NumberFromString` | `string` to `number` (`NumberFromString` accepts `"NaN"`) |
| `Schema.BigIntFromString`, `Schema.BigDecimalFromString` | `string` to `bigint`, `BigDecimal` |
| `Schema.DateFromString`, `Schema.DateFromMillis` | `string`, `number` to a valid `Date` |
| `Schema.DateTimeUtcFromString` | `string` to `DateTime.Utc` |
| `Schema.URLFromString` | `string` to `URL` |
| `Schema.Trim` | `string` to a trimmed `string` |
| `Schema.fromJsonString(S)` | JSON text to `S.Type` |
| `Schema.StringFromBase64`, `Schema.StringFromBase64Url`, `Schema.StringFromHex`, `Schema.StringFromUriComponent` | encoded text to text |
| `Schema.BooleanFromBit` | `0` or `1` to `boolean` |
| `Schema.DurationFromString`, `Schema.DurationFromMillis` | `string`, `number` to `Duration` |
| `Schema.RedactedFromValue(S)` | a raw value to `Redacted<S.Type>` |
| `SchemaTransformation.toLowerCase()`, `toUpperCase()`, `capitalize()` | use as `Schema.String.pipe(Schema.decodeTo(Schema.String.check(Schema.isLowercased()), SchemaTransformation.toLowerCase()))` |

## Recover from a decoding failure

`Schema.catchDecoding((issue) => Effect.succeedSome(fallback))` replaces a failed decode with a value. Use it for tolerant reads of old data, not for input validation, where the failure is the answer.

## Traps

- Decoding twice: when the target holds values that the source has already decoded, use `Schema.toType(target)` as the target. `Schema.Array(item).pipe(Schema.decodeTo(Schema.ReadonlySet(Schema.toType(item)), ...))` decodes each item once.
- An asynchronous step (a delay, a promise, I/O) makes the schema unusable with the Sync, Result and Option decoders: they throw. A synchronous `transformEffect` step works with all decoders. Decode async schemas with `decodeUnknownEffect` or `decodeUnknownPromise`.
- A constructor default (`withConstructorDefault`) does not apply while decoding. Use `withDecodingDefault` for input.
