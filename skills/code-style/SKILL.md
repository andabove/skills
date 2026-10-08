---
name: code-style
description: Fifteen TypeScript code rules for modules, names, doc comments, types, boundaries, errors and side effects. Use when you write or change TypeScript, or when you review a TypeScript diff.
---

# Code style

## Read the local facts first

The repository's code style doc supplies what these rules leave open. Find it from `AGENTS.md` or `CLAUDE.md`. It names:

- the paths that the rules cover,
- the lint configs that enforce part of the rules, and where a file override goes,
- the schema library for the boundary parse,
- the seam module for each external service,
- the environment helper and the request logger,
- where history and provenance go, such as a decision log.

Where the local doc and these rules disagree, the local doc wins.

## Write code

Apply every rule to each file that you change. Before you commit, run the linters: they enforce part of the rules. Check the other rules against your diff yourself.

## Review code

Mark each rule pass or fail for the diff, with the `file:line` of each failure. Done when every rule has a mark. A rule that the diff does not touch passes.

## Rules

1. **Give each module one job.** Keep a file to at most 250 code lines. Keep framework entry files (routes, plugins, config files) declarative, and move their logic into a named module.
2. **Move a helper to a shared module when a second caller needs it.** Do not copy it.
3. **Keep functions to at most 30 code lines.** Name actions with a verb and values with a noun. Add `OrThrow` to the name of a function that throws where a reader expects a return value.
4. **Put a `/** */` doc comment on every exported symbol.** Line one says what it is. `@remarks` says why it exists, the hazard it prevents, and what fails without it. Point to a related module that handles the same hazard.
5. **Write comments that give a reason, not a narration, a history or a provenance.** A `//` comment inside a function is only for a value or an order that is not obvious. Ticket IDs, incident stories and design references go in the commit message, the pull request or the decision log.
6. **Declare the parameter and return types of every exported function**, `Promise<…>` included. Use `import type` for imports that are only types.
7. **Use no `any` and no `as` type assertion** (`as const` is permitted). Narrow `unknown` with `instanceof`, a type guard or a schema parse. When a third-party type forces a cast, put the cast in one named adapter function with a doc comment, and give that file a lint override.
8. **Use `satisfies` for configuration objects**, and literal discriminants (`ok: true`, `ok: false`) on returned results.
9. **Parse every value from outside the process with a schema at the boundary:** request bodies, tool inputs and outputs, database documents and environment values.
10. **Choose the error channel by the reader of the failure.** Throw a typed error for a configuration or infrastructure fault. Return a typed result for a fault that a model or a user can correct. Keep the two channels apart in one function.
11. **Write each error message so that it names the action, the evidence (an id, a status, trimmed and sanitised output) and the fix when one is known.** When you translate an error, keep the original as `{ cause }`.
12. **Check the result of every external call before you use it.** Add a fallback only with a comment that gives the reason.
13. **Undo each temporary side effect in `finally`.** Use `await` in sequence unless the steps are independent and the parallel version is measured to be faster.
14. **Put each external service behind one seam module** that owns its client, its keys and its access check. Derive keys and ownership from server state, never from model or user input.
15. **Read required environment values once, at module load, through one throwing helper.** Keep named constants in one constants module. Write units as arithmetic (`14 * 24 * 60 * 60 * 1000`). Log only through the request logger, never through `console`.
