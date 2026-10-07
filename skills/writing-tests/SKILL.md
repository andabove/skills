---
name: writing-tests
description: Decide whether a test earns its place, where it goes, and what it asserts. Use before you write or change a test, when a bug fix needs a regression test, when code gains an export or parameter that only a test uses, or when you review or prune tests.
---

# Writing tests

A test earns its place when it protects a contract that a user, a caller or the stored data can observe, and no other test protects that contract already. Each contract has one **owning test** at its strongest boundary. Most of the work below is finding that owner.

Put most tests on the pure logic that holds the product's rules. Test a UI component only where its behaviour is not obvious.

## Read the local facts first

The repository's testing doc supplies what this skill leaves open. Find it from `AGENTS.md` or `CLAUDE.md`. Read it before step 1. It names:

- the test runner, which supplies the module mocks and the fake timers,
- the owning boundaries: the layer where each kind of contract is tested at its strongest,
- the test projects and the file name that selects each one,
- the fakes for slow, paid or random dependencies, such as a model or a payment API,
- the snapshots that the repository freezes on purpose,
- its instances of the [seams we allow](#seams-we-allow).

Where the testing doc and this skill disagree, the testing doc wins. If the repository has no testing doc, ask the user for the owning boundaries before step 3.

## Add a test

Do the steps in order. If a step does not reach its done line, add no test yet.

1. **Name the contract.** Write one sentence that says what a user, a caller or the stored data can observe. Done when the sentence names something observable, not a function.
2. **Name the regression.** Name the credible code change that makes the test fail. For a bug fix, the regression is the bug.
3. **Find the owner.** Search the tests at the owning boundary for the contract. If the owner can reach the regression, extend its table or fixture instead of writing a near-copy. Add a test at another layer only for a risk that the owner cannot reach. Done when you can name the owning test file, or say why no owner exists.
4. **Check the seams.** If the test needs an export, a parameter, a flag or a hook that no production caller needs, the seam must be one of the [seams we allow](#seams-we-allow). Otherwise, test at the real boundary.
5. **Place the file** next to the code that it tests, unless the testing doc says otherwise. Pick the test project from the testing doc.
6. **Write it** to the [rules](#rules).
7. **For a bug fix, make it red.** Run the test on the code before the fix. It must fail for the reason the bug gives, then pass after the fix. A test that never went red proves the mock, not the fix. One regression test at the owning boundary covers the bug. Do not repeat it at each layer that the bug crosses.
8. **Check it against the [review list](#review-list).** Then run its test project. Done when each new or changed test passes every line of the list and its project passes.

To review or prune existing tests, apply the review list to each test, and delete what fails it.

## Rules

- **Pass fakes for slow, paid or random services.** No test calls a live model or a paid API: a live call is slow, costs money, gives a different answer each run and fails offline. Pass the fake in through the code's own parameter. A module mock (`vi.mock` in Vitest, `jest.mock` in Jest, `mock.module` in `node:test`) replaces the import for every caller and hides the dependency from the reader.
- **Use a real or emulated database.** A database mock tests the mock.
- **One behaviour for each test**, named in plain words.
- **Write explicit assertions.** Use a snapshot only for the content that the testing doc freezes: words or numbers that change what the product does. When a frozen snapshot changes on purpose, update it, review the diff, and commit it with the change.
- **Use captured output from the real service** where a test needs a realistic answer. Store the fixture next to the test.
- **Control the clock with the runner's fake timers** (`vi.setSystemTime` in Vitest, `mock.timers.setTime` in `node:test`), not a `now` parameter.

## Seams we allow

A seam is an export or a parameter that only a test uses. Four kinds are allowed, because the real boundary costs more than the seam does:

- **A pure helper, exported for a table test.** The entry point needs a model, a database or a full request. The table is fast and names each case.
- **A parser of process output.** The test gives the parser a string, so it needs no real process.
- **An injected dependency that reaches a failure branch.** Use one only for a failure that the real or emulated service cannot produce.
- **A parameter that isolates parallel tests** on shared infrastructure, such as a root path or a namespace for each test file.

Every other seam goes:

- An export that no production code calls: delete it and its test.
- A parameter whose default only a test changes: make it required and pass the production value, or delete it.

## Review list

A test lands only when it passes every line:

- It asserts something, and it compares the value with an independent expected value, not with itself.
- A person wrote the expected value. The helper or renderer under test did not produce it.
- It checks behaviour, not a copy of a fixture, a constant list or an export list asserted back. The frozen snapshots are the exceptions.
- It runs the code. A rule about the source (a grep, an import, an exact string) is a lint rule instead.
- Its mocks and fixtures supply inputs only. The code under test produces the behaviour and the output that the test asserts.
- A negative test fails at the guard that it names, not at a refusal from a different guard.
- Its name promises no more than its input exercises.
- It protects a production path. A test that exists only to keep a test-only export alive goes, with the export.
- It survives a refactor that keeps the behaviour. A test that breaks on such a refactor asserts the implementation: rewrite it at the owning boundary.
