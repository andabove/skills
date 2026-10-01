# Schema errors and messages

Reference for [effect-schema](../SKILL.md). Checked against `effect 4.0.0`; the source is `SchemaIssue.ts` and the `SchemaError` class in `Schema.ts`.

## SchemaError

Every decoder and encoder fails with a `SchemaError`:

- `_tag` is `"SchemaError"`, so `Effect.catchTag("SchemaError", ...)` matches it.
- `issue` is the issue tree, a `SchemaIssue.Issue`.
- `message` is the default formatting of the issue: one entry per failure, each with its path on the next line.
- `String(error)` is `SchemaError(<message>)`.

```text
Missing key
  at ["email"]
Expected an integer
  at ["age"]
```

The leaves of the issue tree are `InvalidType` (wrong JavaScript type), `InvalidValue` (right type, rule failed), `MissingKey`, `UnexpectedKey`, `Forbidden` and `OneOf`. The containers are `Composite`, `Pointer`, `Filter`, `Encoding` and `AnyOf`. Read the tree only to build a custom formatter; otherwise use a formatter below.

A `Schema.Class` constructor throws a plain `Error` with the message `Schema validation failed` and the issue on `error.cause`. Format it with `SchemaIssue.makeFormatterDefault()(error.cause)` after you check `SchemaIssue.isIssue(error.cause)`.

## Formatters

| Formatter | Output | Use for |
| --- | --- | --- |
| `error.message` (same as `SchemaIssue.makeFormatterDefault()(error.issue)`) | one string | logs, exceptions |
| `SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues` | `ReadonlyArray<{ path, message }>` | forms, API error bodies |

`makeFormatterStandardSchemaV1({ leafHook })` customizes the message of each leaf issue. Delegate the cases you do not handle to `SchemaIssue.defaultLeafHook`:

```ts
import { SchemaIssue } from "effect"

export const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1({
  leafHook: (issue) => (issue._tag === "MissingKey" ? "Required" : SchemaIssue.defaultLeafHook(issue))
})
```

## Messages

Put the message on the rule that fails:

| Where | How | Replaces |
| --- | --- | --- |
| a check | `Schema.isMinLength(8, { message: "..." })` | that check's failure |
| a schema | `Schema.String.annotate({ message: "..." })` | the wrong-type failure of that schema |
| after `.check(...)` | `.annotate({ message: "..." })` | the failure of the last check only |
| a struct field | `Schema.annotateKey({ messageMissingKey: "..." })` | the missing-key failure |
| a struct | `.annotate({ messageUnexpectedKey: "..." })` | the excess-key failure under `onExcessProperty: "error"` |
| any schema | `.annotate({ identifier: "Person" })` | `Expected object` becomes `Expected Person` |

When several checks have messages, the first check that fails supplies the message.

## Report all issues

Pass `{ errors: "all" }` to the decoder to collect every failure. Without it, decoding stops at the first. `Schema.toStandardSchemaV1` reports all issues by default.

## An HTTP 400 body

```ts
import { Effect, Schema, SchemaIssue } from "effect"

const Signup = Schema.Struct({
  email: Schema.String.check(Schema.isPattern(/^[^@]+@[^@]+$/, { message: "Enter a valid email" })),
  password: Schema.String.check(Schema.isMinLength(8, { message: "Use at least 8 characters" })),
  name: Schema.String.pipe(Schema.annotateKey({ messageMissingKey: "Name is required" }))
})

export class InvalidInput extends Schema.TaggedError<InvalidInput>()("InvalidInput", {
  fields: Schema.Array(Schema.Struct({ path: Schema.String, message: Schema.String }))
}) {}

const toFields = SchemaIssue.makeFormatterStandardSchemaV1()

export const decodeSignup = (body: unknown) =>
  Schema.decodeUnknownEffect(Signup)(body, { errors: "all" }).pipe(
    Effect.mapError((error) =>
      new InvalidInput({
        fields: toFields(error.issue).issues.map((issue) => ({
          path: (issue.path ?? []).map((segment) => String(typeof segment === "object" ? segment.key : segment)).join("."),
          message: issue.message
        }))
      })
    )
  )

// { email: "nope", password: "short" } fails with
// InvalidInput { fields: [
//   { path: "email", message: "Enter a valid email" },
//   { path: "password", message: "Use at least 8 characters" },
//   { path: "name", message: "Name is required" } ] }
```

Turn `InvalidInput` into a 400 response in the endpoint; see the framework glue in [effect-services](skill:effect-services).
