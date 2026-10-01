---
name: effect-schema
description: Effect 4 Schema for parsing and modelling data. Use when you decode untrusted input such as a request body, JSON, a form or a database row, define a domain model or a tagged error with Schema.Class or Schema.TaggedError, write a transformation between an encoded and a decoded form, format validation errors for users, or connect Schema to zod or another Standard Schema library.
---

# Effect Schema

Checked against `effect 4.0.0`. When the project has a newer version, search `node_modules/effect/src/Schema.ts` (it is large: search for the name, read the match), `SchemaGetter.ts`, `SchemaTransformation.ts` and `SchemaIssue.ts`, and read `node_modules/effect/AGENTS.md`. The installed source wins over this skill.

## The model

A schema is a value that describes data in two forms: `Type`, the value your code uses, and `Encoded`, the value on the wire or on disk. Its full type is `Codec<Type, Encoded, DecodingServices, EncodingServices>`.

- Decoding turns `Encoded` (or `unknown`) into `Type` and validates it. Encoding turns `Type` back into `Encoded`.
- Read the types with `typeof S.Type` and `typeof S.Encoded`.
- A name `XFromY` decodes `Y` into `X`: `Schema.FiniteFromString` has `Type` `number` and `Encoded` `string`.
- Parse every value from outside the process with a schema at the boundary, and use `Schema` for all validation. Hand-written type guards drift from the types they guard.

## Decode untrusted input

```ts
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

export const CreateOrder = Schema.Struct({
  sku: Schema.NonEmptyString,
  quantity: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
  note: Schema.optionalKey(Schema.String)
})
export type CreateOrder = typeof CreateOrder.Type

export class InvalidOrder extends Schema.TaggedError<InvalidOrder>()("InvalidOrder", {
  message: Schema.String
}) {}

const decodeCreateOrder = Schema.decodeUnknownEffect(CreateOrder)

export const parseOrder = (body: unknown): Effect.Effect<CreateOrder, InvalidOrder> =>
  decodeCreateOrder(body, { errors: "all" }).pipe(
    Effect.mapError((error) => new InvalidOrder({ message: error.message }))
  )
```

Pick the decoder by where the code runs:

| Situation | Decoder | On invalid input |
| --- | --- | --- |
| inside Effect code | `Schema.decodeUnknownEffect(S)` | fails with `SchemaError` |
| plain code that branches on the outcome | `Schema.decodeUnknownResult(S)` | returns a `Result` failure holding a `SchemaError` |
| plain code where invalid input is a bug | `Schema.decodeUnknownSync(S)` | throws `SchemaError` |
| plain code with async transformations | `Schema.decodeUnknownPromise(S)` | rejects with `SchemaError` |
| a yes or no answer | `Schema.is(S)` | returns `false` |

- `decodeUnknown*` accepts `unknown`. `decode*` accepts a value already typed as `Encoded`. The `encode*` family mirrors both.
- Build each decoder once, at module scope. Options go to the factory or to each call: `Schema.decodeUnknownEffect(S, { errors: "all" })` or `decode(input, { errors: "all" })`.
- Unknown keys are dropped without an error. Pass `{ onExcessProperty: "error" }` to reject them. The option takes only `"ignore"` (the default) and `"error"`.
- Only the first issue is reported. Pass `{ errors: "all" }` for forms and API error bodies.
- The Sync, Result and Option decoders cannot run an asynchronous transformation. They throw a plain `Error`, not a `SchemaError`, and `decodeUnknownExit` returns a defect. Decode such schemas with the Effect or Promise decoder.
- Parse JSON text with `Schema.fromJsonString(S)`. Invalid JSON fails with `Expected a valid JSON string`.
- Catch the error with `Effect.catchTag("SchemaError", ...)`. Map it to a domain error at the boundary, as `parseOrder` does.
- `Schema.Finite` rejects `NaN` and `Infinity`; `Schema.Number` accepts them. Prefer `Finite` or `Int` for input.
- `Schema.optional(S)` accepts an absent key or `undefined`. `Schema.optionalKey(S)` accepts an absent key but rejects `undefined`.

Primitives, filters, unions, records and recursion: [references/effect-schema-building-blocks.md](references/effect-schema-building-blocks.md).

## Encode for the wire

Before you send or store a decoded value, encode it with the same schema: `Schema.encodeEffect(S)(value)` inside Effect, `Schema.encodeSync(S)(value)` outside. Encoding produces the `Encoded` form: a `Date` from `DateFromString` becomes an ISO string, a class instance becomes a plain object, an `Option` from `OptionFromNullOr` becomes `null` or the value. `JSON.stringify` on the decoded value skips this and emits the wrong shape.

## Schema.Class: a domain model

```ts
import * as Equal from "effect/Equal"
import * as Schema from "effect/Schema"

export class Customer extends Schema.Class<Customer>("myapp/Customer")({
  id: Schema.String,
  email: Schema.String.check(Schema.isPattern(/^[^@]+@[^@]+$/)),
  joinedAt: Schema.DateFromString
}) {
  get domain(): string {
    return this.email.split("@")[1] ?? ""
  }
}

const customer = Schema.decodeUnknownSync(Customer)({ id: "c1", email: "ada@example.com", joinedAt: "2026-01-01T00:00:00.000Z" })
customer.domain // "example.com"
Schema.encodeSync(Customer)(customer) // { id: "c1", email: "ada@example.com", joinedAt: "2026-01-01T00:00:00.000Z" }
Equal.equals(customer, new Customer({ ...customer })) // true
```

- Decoding returns an instance of the class. Encoding returns a plain object in the `Encoded` form.
- The string identifier names the schema in error messages and JSON Schema, and recognizes instances across hot module reloads. Make it unique.
- `new Customer({ ... })` and `Customer.make({ ... })` validate and throw an `Error` whose message is `Schema validation failed`; the issue is on `error.cause`. For input that can be invalid, decode it, or call `Customer.makeOption`, which returns an `Option`.
- The `Type` side is the class: `Schema.is(Customer)` returns `false` for a plain object with the same fields.
- Instances compare by value with `Equal.equals`.
- `Customer.extend<Vip>("myapp/Vip")({ tier: Schema.Int })` adds fields and keeps the methods. `Schema.TaggedClass<Self>()("Tag", fields)` adds a `_tag` field.
- Use `Schema.Class` when the value needs methods, `instanceof` or a nominal type. Use `Schema.Struct` for plain data such as request bodies.

## Schema.TaggedError: a typed, serializable error

```ts
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

export class PaymentDeclined extends Schema.TaggedError<PaymentDeclined>()("PaymentDeclined", {
  orderId: Schema.String,
  reason: Schema.Literals(["insufficient_funds", "card_expired"])
}) {}

export const charge = (orderId: string): Effect.Effect<string, PaymentDeclined> =>
  Effect.gen(function* () {
    if (orderId.startsWith("x")) return yield* new PaymentDeclined({ orderId, reason: "card_expired" })
    return `receipt-${orderId}`
  })

export const handled = charge("x1").pipe(
  Effect.catchTag("PaymentDeclined", (e) => Effect.succeed(`declined: ${e.reason}`))
)
```

- Write `return yield* new PaymentDeclined({ ... })` inside `Effect.gen`. The `return` tells TypeScript the branch ends.
- An instance is an `Error` with a stack. Its `name` is the tag. Its `message` is empty unless you declare a `message` field.
- It is also a schema: it encodes to `{ _tag, ...fields }` and decodes back to an instance. Use it for errors that cross a boundary: RPC, HTTP bodies, worker messages, stored jobs.
- Store a caught exception in a field with `Schema.Defect()`, which encodes an `Error` as `{ name, message }`.
- `Schema.Error<Self>("Name")({ fields })` is the variant without `_tag`. Version 4.0.0 has no `Schema.TaggedErrorClass` or `Schema.ErrorClass`.
- For errors that never leave the process, `Data.TaggedError` is lighter. Error handling as a whole is in [effect-errors](skill:effect-errors).

## Transformations

`Source.pipe(Schema.decodeTo(Target, transformation))` decodes with `Source`, runs your decode step, then decodes with `Target`. Encoding runs the same path backwards.

```ts
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaGetter from "effect/SchemaGetter"
import * as SchemaIssue from "effect/SchemaIssue"
import * as SchemaTransformation from "effect/SchemaTransformation"

// infallible both ways
export const Toggle = Schema.Literals(["on", "off"]).pipe(
  Schema.decodeTo(
    Schema.Boolean,
    SchemaTransformation.transform({ decode: (s) => s === "on", encode: (b) => (b ? "on" : "off") })
  )
)

// decoding can fail: "12.34" <-> 1234
export const Cents = Schema.String.pipe(
  Schema.decodeTo(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)), {
    decode: SchemaGetter.transformEffect((s) => {
      const match = /^(\d+)\.(\d{2})$/.exec(s)
      return match
        ? Effect.succeed(Number(match[1]) * 100 + Number(match[2]))
        : Effect.fail(new SchemaIssue.InvalidValue({ message: `Expected an amount like 12.34, got ${s}` }))
    }),
    encode: SchemaGetter.transform((cents) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`)
  })
)
```

- Use a built-in before writing one: `FiniteFromString`, `DateFromString`, `DateTimeUtcFromString`, `Trim`, `fromJsonString`, `OptionFromNullOr`, `RedactedFromValue`.
- Write `SchemaTransformation.transform({ decode, encode })` when neither direction can fail. Write `SchemaGetter.transformEffect` for a step that can fail, is asynchronous or needs a service, and fail with `new SchemaIssue.InvalidValue({ message })`. Version 4.0.0 has no `SchemaGetter.transformOrFail`.
- A service used in a transformation appears in `DecodingServices` and in the `R` of `decodeUnknownEffect`.
- Map snake_case wire keys with `Schema.encodeKeys({ userId: "user_id" })` on the struct.
- `Schema.withDecodingDefault` fills a missing key while decoding. `Schema.withConstructorDefault` fills it only in `make` and `new`; decoding still requires the key.

Getters, optional-key transformations, one-way schemas and checks with effects: [references/effect-schema-transformations.md](references/effect-schema-transformations.md).

## Format errors

- `error.message` lists one issue per entry with its path, for example `Missing key\n  at ["sku"]`. It is fine for logs.
- For a form or an API error body, call `SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues` to get `[{ path, message }]`.
- Set messages where the rule lives: `Schema.isMinLength(8, { message: "Use at least 8 characters" })`, `.annotate({ message })` on a schema, and `Schema.annotateKey({ messageMissingKey: "Name is required" })` for an absent key.

The issue model, message precedence and an HTTP 400 example: [references/effect-schema-errors.md](references/effect-schema-errors.md).

## Standard Schema and zod

[Standard Schema](https://standardschema.dev) is the shared interface that zod, Valibot, ArkType and Effect Schema implement.

- To hand an Effect schema to a library that accepts Standard Schema (a form library, a router, a tRPC procedure), pass `Schema.toStandardSchemaV1(S)`. It reports all issues, returns a `Promise` when the schema is asynchronous, and requires `DecodingServices` to be `never`. It adds `~standard` to `S` itself and returns the same object, so a second call ignores its options: call it once, where you define a schema you own.
- To decode with a zod schema inside Effect, 4.0.0 has no built-in importer. Wrap `schema["~standard"].validate` in a small adapter that fails with a tagged error: [references/effect-schema-interop.md](references/effect-schema-interop.md).
- In a project that already uses zod, keep the zod schemas at the boundaries that have them and adapt them. Write new schemas with Effect Schema, and convert one module at a time. Validate a value with one library, not both.

## Review

To review schema code against this skill, mark each rule bullet above pass or fail for the diff, with the `file:line` of each failure. A rule the diff does not touch passes. Done when every bullet has a mark.

## Related skills

- [effect](skill:effect) for `Effect.gen`, `Effect.fn` and running effects.
- [effect-errors](skill:effect-errors) for tagged errors, `catchTag` and `Cause`.
- [effect-services](skill:effect-services) for `Config.schema` and decoding inside services and handlers.
- [effect-data](skill:effect-data) for `Option`, `Result`, `DateTime`, `Data` and `Equal`.
- [effect-testing](skill:effect-testing) for testing decoders and property-based tests.
