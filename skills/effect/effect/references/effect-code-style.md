# Effect code style

Checked against `effect` 4.0.0. These rules extend the house style in `SKILL.md`. Where the project's own style guide disagrees, the project wins.

## Choose the form

| Code | Form |
| --- | --- |
| a reusable function that returns an effect | `Effect.fn("Name")(function*(...) { ... }, ...transforms)` |
| a hot path or a library internal | `Effect.fnUntraced(function*(...) { ... })` |
| a sequence of steps used once | `Effect.gen(function*() { ... })` |
| a wrapper around a whole effect | `effect.pipe(Effect.timeout(...), Effect.retry(...))` |
| one step on a value | `Effect.map(effect, (a) => ...)` |

- Name each `Effect.fn` after the function, or `Service.method` for a service method. The name is the span name in traces.
- `Effect.Do`, `Effect.bind`, `Effect.bindTo` and `Effect.let` still exist. Read them in old code; write `Effect.gen` in new code.

## Write callbacks as lambdas

`Effect.map((x) => f(x))`, not `Effect.map(f)`. A point-free callback receives every argument the operator passes, so a function with an optional parameter can get a value it does not expect (`Effect.forEach` passes the index), and a generic or overloaded function can lose its type parameters. The same goes for `flow` from `effect/Function`.

## Dual APIs

Most operators take the data first or last:

```ts
import * as Effect from "effect/Effect"

const total = Effect.succeed(40)

export const dataFirst = Effect.map(total, (n) => n + 2)
export const dataLast = total.pipe(Effect.map((n) => n + 2))
```

Use data-first for one step, `pipe` for two or more.

## Control flow operators

Plain `if` and loops inside `Effect.gen` are usually clearer. These operators earn their place in a pipeline:

| Operator | Behaviour |
| --- | --- |
| `Effect.when(effect, condition)` | runs `effect` when the `Effect<boolean>` condition succeeds with `true`; the result is an `Option` |
| `Effect.zip(a, b, { concurrent: true })` | a tuple of both results; sequential without the option |
| `Effect.zipWith(a, b, f, options?)` | combines both results with `f` |
| `Effect.forEach(items, f, { discard: true })` | runs `f` for each item and drops the results |
| `Effect.all(effects, { mode: "result" })` | runs every effect, even after a failure, and returns a `Result` for each |
| `Effect.whileLoop({ while, body, step })` | runs `body` while `while()` is true and passes each result to `step`; returns `void` |

## Branch on a union with Match

`Match` gives an exhaustive check that a `switch` gives only with extra code.

```ts
import * as Match from "effect/Match"

type Payment =
  | { readonly _tag: "Card"; readonly last4: string }
  | { readonly _tag: "Transfer"; readonly iban: string }
  | { readonly _tag: "Voucher"; readonly code: string }

export const describe = Match.type<Payment>().pipe(
  Match.withReturnType<string>(),
  Match.tag("Card", (p) => `card ending ${p.last4}`),
  Match.tag("Transfer", (p) => `transfer from ${p.iban}`),
  Match.tag("Voucher", (p) => `voucher ${p.code}`),
  Match.exhaustive
)
```

- `Match.exhaustive` fails to compile when a case is missing. `Match.orElse` gives a fallback, `Match.option` and `Match.result` return the miss as a value.
- Put `Match.withReturnType` first in the pipe, so that it checks every branch.
- `Match.tag` reads the `_tag` field. Give each tagged type a unique tag.

## Name ids with Brand

```ts
import * as Brand from "effect/Brand"

export type OrderId = string & Brand.Brand<"OrderId">
export const OrderId = Brand.nominal<OrderId>()

export type Quantity = number & Brand.Brand<"Quantity">
export const Quantity = Brand.make<Quantity>(
  (n) => (Number.isInteger(n) && n > 0) || `expected a positive integer, got ${n}`
)
```

- `Brand.nominal` checks nothing at runtime. `Brand.make` throws a `BrandError` on a bad value; `Quantity.result(n)` and `Quantity.option(n)` return the failure as a value.
- For values that come from outside the process, use a branded `Schema` instead (see `effect-schema`), so that the check and the parse are one step.

## Guards, time and parsing

- Use the `Predicate` module (`Predicate.isString`, `Predicate.hasProperty`, `Predicate.isTagged`) for runtime type guards. Do not write your own `isRecord` or `isString`.
- Read the time with `Clock` or `DateTime.now`, not `Date.now()`, so that `TestClock` controls it in tests.
- Parse untrusted input with `Schema`, not with manual checks or `as` casts.

## Keep effects visible

- Do not leave an effect unused: an effect expression on its own line does nothing. `yield*` it, return it, or combine it.
- Do not run an effect inside another effect (`Effect.runPromise` in an `Effect.gen` body). `yield*` it, so that errors, interruption and services flow through.
