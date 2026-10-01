# Schema building blocks

Reference for [effect-schema](../SKILL.md). Checked against `effect 4.0.0`; search `node_modules/effect/src/Schema.ts` for any name below.

## Primitives

| Schema | Type | Notes |
| --- | --- | --- |
| `Schema.String` | `string` | |
| `Schema.Finite` | `number` | rejects `NaN` and `Infinity`; the default for numbers |
| `Schema.Number` | `number` | accepts `NaN` and `Infinity` |
| `Schema.Int` | `number` | integer |
| `Schema.Boolean`, `Schema.BigInt`, `Schema.Symbol` | | |
| `Schema.Null`, `Schema.Undefined`, `Schema.Void` | | |
| `Schema.Unknown`, `Schema.Any`, `Schema.Never` | | |
| `Schema.NonEmptyString`, `Schema.Trimmed` | `string` | checked strings |
| `Schema.Date` | `Date` | a valid `Date` instance; `Schema.DateFromString` decodes a string |
| `Schema.URL` | `URL` | a `URL` instance; `Schema.URLFromString` decodes a string |
| `Schema.DateTimeUtc` | `DateTime.Utc` | `Schema.DateTimeUtcFromString` decodes a string |

## Literals and enums

```ts
import * as Schema from "effect/Schema"

export const Role = Schema.Literals(["admin", "member", "guest"])
export const Staff = Role.pick(["admin", "member"])
export const Version = Schema.Literal(2)
export const OrderRef = Schema.TemplateLiteral(["ord_", Schema.String])

enum Color { Red, Green }
export const ColorSchema = Schema.Enum(Color)
```

`Role.literals` holds the values as a tuple.

## Checks

Add rules with `.check(...)`. A check runs only after the base schema accepts the input, and it does not change `Type`.

| Values | Filters |
| --- | --- |
| strings and arrays | `isMinLength(n)`, `isMaxLength(n)`, `isBetweenLength(min, max)`, `isNonEmpty()` |
| strings | `isPattern(re)`, `isStartingWith(s)`, `isEndingWith(s)`, `isIncluding(s)`, `isTrimmed()`, `isLowercased()`, `isUppercased()`, `isCapitalized()`, `isUUID(version?)`, `isULID()`, `isBase64()` |
| numbers | `isInt()`, `isFinite()`, `isGreaterThan(n)`, `isGreaterThanOrEqualTo(n)`, `isLessThan(n)`, `isLessThanOrEqualTo(n)`, `isBetween({ minimum, maximum })`, `isMultipleOf(n)` |
| dates | `isGreaterThanDate(d)`, `isLessThanDate(d)`, `isBetweenDate({ minimum, maximum })` |
| arrays | `isUnique()` |
| bigints | `isGreaterThanBigInt(n)`, `isBetweenBigInt({ minimum, maximum })` and the rest of that family |

Each filter takes an optional last argument for annotations such as `{ message: "..." }`. The website names `isLengthBetween`, `isStartsWith`, `isEndsWith` and `isIncludes`; version 4.0.0 calls them `isBetweenLength`, `isStartingWith`, `isEndingWith` and `isIncluding`.

A custom rule is `Schema.makeFilter(predicate)`. The predicate returns `true` or `undefined` to pass, `false` or a message string to fail, or `{ path, issue }` to report the failure on a field:

```ts
import * as Schema from "effect/Schema"

export const PasswordForm = Schema.Struct({
  password: Schema.String.check(Schema.isMinLength(8)),
  confirm: Schema.String
}).check(
  Schema.makeFilter((form) =>
    form.password === form.confirm ? undefined : { path: ["confirm"], issue: "Passwords do not match" }
  )
)
```

A predicate can return an array of such issues to report several at once. A check that needs an effect or a service is a transformation; see [effect-schema-transformations.md](effect-schema-transformations.md).

## Structs and optional fields

```ts
import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"

export const User = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  password: Schema.String,
  nickname: Schema.optionalKey(Schema.String)
})

export const PublicUser = User.mapFields(Struct.omit(["password"]))
export const UserPatch = User.mapFields(Struct.map(Schema.optionalKey))
export const WithAudit = Schema.Struct({ ...User.fields, updatedAt: Schema.DateFromString })
```

| Field schema | Absent key | `undefined` | `null` | Decoded type |
| --- | --- | --- | --- | --- |
| `S` | fails | fails | fails | `T` |
| `Schema.optionalKey(S)` | stays absent | fails | fails | `T` or absent |
| `Schema.optional(S)` | stays absent | kept | fails | `T`, `undefined` or absent |
| `Schema.NullOr(S)` | fails | fails | kept | `T \| null` |
| `Schema.OptionFromOptionalKey(S)` | `None` | fails | fails | `Option<T>` |
| `Schema.OptionFromOptional(S)` | `None` | `None` | fails | `Option<T>` |
| `Schema.OptionFromNullOr(S)` | fails | fails | `None` | `Option<T>` |
| `Schema.OptionFromOptionalNullOr(S)` | `None` | `None` | `None` | `Option<T>` |

- `Schema.Struct({})` accepts any value except `null` and `undefined`. Give a struct at least one field.
- `Schema.StructWithRest(struct, [Schema.Record(Schema.String, S)])` adds an index signature.
- Structs produce `readonly` types. `Schema.mutableKey(S)` makes one field mutable.
- `Schema.encodeKeys({ field: "wire_name" })` renames keys on the encoded side.

## Unions

- `Schema.Union([A, B])` tries members in order and the first match wins. Put the most specific member first: `Union([Struct({ a }), Struct({ a, b })])` drops `b`.
- `Schema.TaggedStruct("Circle", { radius: Schema.Finite })` is a struct with `_tag: "Circle"`. Its `make` fills the tag; decoding requires it.
- `Schema.TaggedUnion` builds a tagged union with helpers:

```ts
import * as Schema from "effect/Schema"

export const Shape = Schema.TaggedUnion({
  Circle: { radius: Schema.Finite },
  Square: { side: Schema.Finite }
})
export type Shape = typeof Shape.Type

export const area = (shape: Shape): number =>
  Shape.match(shape, {
    Circle: (c) => Math.PI * c.radius ** 2,
    Square: (s) => s.side ** 2
  })

export const unitSquare = Shape.cases.Square.make({ side: 1 })
export const isCircle = Shape.guards.Circle
```

## Arrays, records, tuples

- `Schema.Array(S)` and `Schema.NonEmptyArray(S)` give readonly arrays.
- `Schema.Record(Key, Value)` gives a record. A key schema with checks filters keys: a key that fails is dropped, not reported, unless `onExcessProperty` is `"error"`. A key schema can transform keys: `Schema.Record(Schema.Trim, Schema.String)` decodes `{ " a ": "x" }` to `{ a: "x" }`.
- `Schema.Tuple([A, B])`, with `Schema.optionalKey(C)` for an optional element, and `Schema.TupleWithRest(tuple, [Rest])` for rest elements.

## Brands

```ts
import * as Schema from "effect/Schema"

export const UserId = Schema.String.pipe(Schema.brand("UserId"))
export type UserId = typeof UserId.Type

export const id: UserId = UserId.make("u_1")
```

A brand makes a nominal type: a plain `string` does not type check where `UserId` is expected. `make` validates the checks of the schema. Decoding produces the branded type.

## Classes

- `Schema.Class<Self>("id")(fieldsOrStruct, annotations?)`. Pass a `Schema.Struct(...).check(...)` instead of fields to validate across fields.
- `new C(input, { disableChecks: true })` skips validation. Use it only for data you produced.
- `C.make(input)` is the same as `new C(input)`. `C.makeOption(input)` returns an `Option`. `C.makeEffect(input)` fails with a `SchemaIssue.Issue`, not a `SchemaError`.
- `C.fields` holds the field schemas. `C.identifier` holds the id.
- `C.extend<D>("id")(moreFields)` makes a subclass. `Schema.TaggedClass<Self>()("Tag", fields)` adds `_tag`.
- A recursive class needs an explicit type on the self reference:

```ts
import * as Schema from "effect/Schema"

export class Category extends Schema.Class<Category>("myapp/Category")({
  name: Schema.String,
  children: Schema.Array(Schema.suspend((): Schema.Codec<Category> => Category))
}) {}
```

When a recursive schema's `Encoded` differs from its `Type`, write both: `Schema.Codec<Category, CategoryEncoded>`, with an interface for `CategoryEncoded`.

## Constructors and defaults

- Every schema has `make`, `makeOption` and `makeEffect`, which work on the `Type` side and apply checks.
- `Schema.withConstructorDefault(Effect.succeed(value))` makes a field optional in `make` and `new`. Decoding still requires it.
- `Schema.withDecodingDefault(Effect.succeed(encodedValue))` fills a field that is absent from the input. `Schema.withDecodingDefaultType(Effect.succeed(value))` takes a `Type` value instead. `Schema.withDecodingDefaultKey` and `withDecodingDefaultTypeKey` apply only when the key is absent, not when it is `undefined`.

## Projections

- `Schema.toType(S)` keeps only the decoded side: its `Encoded` equals its `Type`. Use it as the target of a transformation whose values are already decoded.
- `Schema.toEncoded(S)` keeps only the encoded side with its checks.

## Effect data types

`Schema.Option(S)`, `Schema.Result(S, E)`, `Schema.Exit(S, E, Defect)`, `Schema.ReadonlyMap(K, V)`, `Schema.ReadonlySet(S)`, `Schema.HashMap(K, V)`, `Schema.HashSet(S)`, `Schema.Duration` and `Schema.Redacted(S)` expect the runtime value on both sides. For a JSON form, derive a codec with `Schema.toCodecJson(S)`: `Option` becomes `{ _tag: "Some", value }`, and a `ReadonlySet` becomes an array. `Schema.DurationFromMillis` and `Schema.DurationFromString` decode a `Duration` from a number or a string.
