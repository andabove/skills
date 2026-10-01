# Standard Schema, zod and JSON Schema

Reference for [effect-schema](../SKILL.md). Checked against `effect 4.0.0` and `zod 4.6`. The source is `Schema.ts` (`toStandardSchemaV1`, `toJsonSchemaDocument`) and `StandardSchema.ts` in `node_modules/effect/src/`.

## Standard Schema

[Standard Schema](https://standardschema.dev) is one interface that validation libraries implement: an object with a `~standard` property whose `validate(value)` returns `{ value }` or `{ issues: [{ message, path? }] }`, or a `Promise` of either. zod (3.24 and later), Valibot, ArkType and Effect Schema implement it. Its types ship in effect as `effect/StandardSchema`.

## Effect Schema to a Standard Schema consumer

`Schema.toStandardSchemaV1(S)` adds a `~standard` property (vendor `"effect"`) to `S` itself and returns the same object. Pass it wherever a library asks for a Standard Schema.

```ts
import * as Schema from "effect/Schema"

export const SignupForm = Schema.toStandardSchemaV1(
  Schema.Struct({
    email: Schema.String.check(Schema.isPattern(/^[^@]+@[^@]+$/, { message: "Enter a valid email" })),
    password: Schema.String.check(Schema.isMinLength(8, { message: "Use at least 8 characters" }))
  })
)

// { issues: [{ path: ["email"], message: "Enter a valid email" }, { path: ["password"], ... }] }
export const result = SignupForm["~standard"].validate({ email: "nope", password: "x" })
```

- It reports every issue, not only the first.
- `validate` returns a plain result for a synchronous schema and a `Promise` when a transformation is asynchronous. A consumer that only handles plain results breaks on an async schema.
- The schema must not need services: `toStandardSchemaV1` does not type check when `DecodingServices` is not `never`.
- `toStandardSchemaV1(S, { leafHook, parseOptions })` customizes messages and options, as in [effect-schema-errors.md](effect-schema-errors.md). The first call wins: a later call on the same schema returns it unchanged and ignores new options. Call it once, at definition, on a schema you own, never on a shared built-in such as `Schema.String`.
- The result is still the Effect schema. `Schema.decodeUnknownEffect(SignupForm)` keeps working.

## A zod schema inside Effect code

Effect 4.0.0 has no function that turns a foreign Standard Schema into an Effect schema. Adapt it with a decoder that returns an Effect and fails with a tagged error. The adapter stays synchronous when the schema is synchronous, so `Effect.runSync` still works.

```ts
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import type { StandardSchemaV1 } from "effect/StandardSchema"

export class StandardSchemaError extends Schema.TaggedError<StandardSchemaError>()("StandardSchemaError", {
  issues: Schema.Array(Schema.Struct({ path: Schema.String, message: Schema.String }))
}) {}

const toEffect = <A>(result: StandardSchemaV1.Result<A>): Effect.Effect<A, StandardSchemaError> =>
  result.issues === undefined
    ? Effect.succeed(result.value)
    : Effect.fail(
      new StandardSchemaError({
        issues: result.issues.map((issue) => ({
          path: (issue.path ?? []).map((segment) => String(typeof segment === "object" ? segment.key : segment)).join("."),
          message: issue.message
        }))
      })
    )

export const decodeStandard = <S extends StandardSchemaV1>(schema: S) =>
  (input: unknown): Effect.Effect<StandardSchemaV1.InferOutput<S>, StandardSchemaError> =>
    Effect.suspend(() => {
      const result = schema["~standard"].validate(input)
      return Predicate.isPromise(result) ? Effect.flatMap(Effect.promise(() => result), toEffect) : toEffect(result)
    })
```

Use it with any Standard Schema, for example zod:

```ts nocheck
import * as Effect from "effect/Effect"
import { z } from "zod"
import { decodeStandard } from "./decodeStandard"

const Signup = z.object({ email: z.email(), age: z.number().int().min(18) })
const decodeSignup = decodeStandard(Signup)

// Effect<{ email: string; age: number }, StandardSchemaError>
export const signup = (body: unknown) =>
  decodeSignup(body).pipe(Effect.catchTag("StandardSchemaError", (e) => Effect.succeed({ status: 400, body: e.issues })))
```

- The output type is the zod schema's output type.
- The adapter tests for a promise with `Predicate.isPromise`, which checks for a `then` method. `instanceof Promise` misses a promise from another realm (a `node:vm` context, an iframe) and would treat it as a successful result with an `undefined` value.
- A zod schema with an async refinement makes `validate` return a `Promise`; the adapter then needs `Effect.runPromise` or a runtime's `runPromise`, as any async Effect does.
- A throw inside a zod refinement makes `validate` return a rejected `Promise`. The adapter then turns it into a defect, not a `StandardSchemaError`, and the effect is asynchronous, so run it with `runPromise`.

## Move a zod codebase to Effect Schema

Sort each schema's consumers first:

- A **Standard Schema consumer** calls `~standard.validate` (for example `standardSchemaResolver` from `@hookform/resolvers`). It accepts `Schema.toStandardSchemaV1(schema)`.
- A **zod consumer** calls zod's own API (for example `zodResolver`). It rejects an Effect schema with `Invalid input: not a Zod schema`. `toStandardSchemaV1` does not give an Effect schema zod's API.

Then:

1. Keep each existing zod schema where it is. Where Effect code needs one, call it through `decodeStandard`.
2. Write new schemas with Effect Schema when every consumer is a Standard Schema consumer. Keep zod for a schema that a zod consumer reads, or move that consumer to its Standard Schema integration first.
3. Convert one module at a time, starting with the schemas that Effect code reads most. Delete the zod schema in the same change, so one value is never validated by two libraries.
4. Translate by meaning, not by name, and test the boundary with the inputs it really receives:
   - `z.string().email()` has no single counterpart; write `Schema.String.check(Schema.isPattern(...))`.
   - `z.coerce.number()` is not `Schema.FiniteFromString`. zod coerces any input with `Number()`: `123` stays `123`, `true` becomes `1`, `null` becomes `0`. `Schema.FiniteFromString` accepts only strings and rejects all three. Use it when only strings should pass, and say so in the change. Write an explicit transformation from `Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])` when callers rely on the other coercions.
   - `.optional()` becomes `Schema.optional`, or `Schema.optionalKey` for an absent key only.
   - `.transform(f)` becomes `Schema.decodeTo` with a transformation, which also needs an `encode` direction or `SchemaGetter.forbidden`.

## JSON Schema

`Schema.toJsonSchemaDocument(S)` returns `{ dialect: "draft-2020-12", schema, definitions }` for the JSON form of `S`: its encoded side, through `Schema.toCodecJson`.

```ts
import * as Schema from "effect/Schema"

const Order = Schema.Struct({
  sku: Schema.NonEmptyString.annotate({ description: "Stock keeping unit" }),
  quantity: Schema.FiniteFromString,
  note: Schema.optionalKey(Schema.String)
}).annotate({ identifier: "Order" })

// schema: { $ref: "#/$defs/Order" }
// definitions.Order: { type: "object", properties: { sku: { type: "string", minLength: 1, description: ... },
//   quantity: { type: "string" }, note: { type: "string" } }, required: ["sku", "quantity"], additionalProperties: true }
export const document = Schema.toJsonSchemaDocument(Order)

// additionalProperties: false
export const strict = Schema.toJsonSchemaDocument(Order, { onExcessProperty: "error" })
```

- Object schemas are open by default (`additionalProperties: true`), matching the decoder's default of dropping unknown keys. Pass `{ onExcessProperty: "error" }` for closed objects, and decode with the same option.
- An `identifier` annotation becomes a definition referenced with `$ref`. A recursive schema needs one.
- Built-in checks become constraints (`minLength`, `pattern`, `maximum`). A custom `makeFilter` check needs a `toJsonSchema` annotation to appear.
- `JsonSchema.toDocumentDraft07(document)` converts to Draft 07, and `JsonSchema.toDocumentDraft04` to Draft 04.
- Generation is best effort. A schema whose meaning JSON Schema cannot state comes out looser: a custom `makeFilter` check without `toJsonSchema` disappears (`{ type: "number" }`), and an opaque `Schema.declare` without a JSON codec becomes an unconstrained `{}`. Validate with the Effect schema, and use the JSON Schema for documentation and clients.
- The website documents an `additionalProperties` option and a closed default; version 4.0.0 has neither.
