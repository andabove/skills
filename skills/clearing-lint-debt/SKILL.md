---
name: clearing-lint-debt
description: Pay down one lint rule's warnings in one small pull request, and stop when no fix leaves behaviour and other counts unchanged. Use when asked to clear a lint rule, reduce a ratchet count, sweep warnings in a directory, or run the lint-debt loop.
---

# Clearing lint debt

Take one rule and one directory, fix the warnings without changing behaviour, lower the recorded count, and open one pull request. Stop when a fix would change behaviour or move a warning instead of removing it.

## Read the local facts first

The repository's instructions name the ratchet command, the lint config, the baseline file and the lint-debt conventions. Find them from `AGENTS.md` or `CLAUDE.md`. Where those disagree with this skill, the repository wins.

## Pick the work

1. Run the ratchet command and read every count. Take the rule the Linear sub-issue names. Without one, take the open rule with the fewest warnings.
2. Take one directory. Keep the change to about 15 files or 300 changed lines, so a reviewer reads it in one sitting.
3. If no file in the directory has a fix that leaves behaviour unchanged, stop. Report the rule, the directory and why, and make no change.

## Fix each warning

For each warning in scope:

- Remove the pattern the rule names. Do not replace it with an equivalent pattern the rule also flags, or move it to another file, another helper or another name.
- Keep behaviour the same. Read the surrounding code and its tests before you change a type, a cast, a parse or an error path.
- If a fix would change behaviour, stop the loop for that warning. A cast that a stricter parse would reject is a real bug. Record it for a separate bug issue, and do not bundle it into this cleanup.
- Never add a disable comment unless the reason is written next to it and a reviewer can judge it. Never widen an override in the lint config. Never raise a count in the baseline file.

Some warnings are deliberate and documented in the code, such as a read the design requires at a single entry point. Do not hide them behind a new helper to make the count fall. Count them, report them, and stop if they are all that remains.

## Verify

Run, in this order, and read each result:

1. The typecheck.
2. The test suite.
3. The lint command, and confirm the rule's count fell.
4. The ratchet command in update mode, which lowers the baseline to the measured counts.

Then compare every count before and after. A rule that fell while another rose is a failure, even if the total fell. Confirm that every lowered count is the one you meant.

When the rule's count reaches zero, flip the rule to error in the same change and remove its counter from the baseline. Do not flip a rule that still has warnings.

## Open the pull request

Use one branch per sub-issue, named so the tracker links it. The title states the outcome, such as "Clear the no-unknown-returns warnings in the audit module". The body follows the pull-request skill and states:

- the rule, its directory and the reason you picked it,
- the before and after count for that rule, and the count of every other rule,
- the blast radius: which modules changed and what tests cover them,
- the commands you ran and their results.

Open no more than two lint-debt pull requests at a time. If two are open, stop and report.

## Stop and report

Stop without a pull request when:

- every remaining warning is a deliberate read or a public surface whose fix would change a type, an export or an error,
- a fix would change behaviour and cannot be split out,
- the verification fails and the cause is not in the cleanup itself.

The report names the rule, the directory, the warnings left, and the reason. It does not claim a fix that was not verified.
