---
name: pull-requests
description: Open a pull request and write its title and body. Use when you open a pull request or rewrite a pull request description.
---

# Pull requests

A pull request body lets a reviewer judge a change before reading the diff: what changes and why, the proof that it works, and what a merge can break. Write it with the `technical-writing` and `unslop` skills. Use the domain words from the repository glossary (often `GLOSSARY.md`) if one exists.

## Read the local rules first

Read the pull request rules in the repository docs. Find them from `AGENTS.md` or `CLAUDE.md`. They can name:

- the base branch,
- the proof that the repository expects for each kind of change,
- the checks to report,
- the one-way doors and the shared areas that make a blast radius wide,
- what to link, such as a ticket.

Where the repository docs and this skill disagree, the repository docs win.

## Open the pull request

Open a pull request only when the user asks for one.

1. **Find the base branch.** Use the repository docs or the target branch that the environment gives. Otherwise, use the default branch.
2. **Read the whole change:** `git log --no-merges <base>..HEAD` and `git diff <base>...HEAD`. Done when you can name, for each commit, the Summary sentence that covers it.
3. **Write the title** in the form of the `commit-messages` skill. If one title cannot cover the branch, tell the user that the branch holds more than one change.
4. **Gather the [evidence](#evidence).** Run each "after" command and each check on the branch HEAD. Output from before the last commit does not count. Run a "before" command on a checkout without the change, such as a worktree at the base branch, and name that commit.
5. **Run the `blast-radius` skill** on the diff, for the [merge danger](#merge-danger).
6. **Write the body** from the [template](#template) to a file. Done when every slot holds real content and no `<…>` placeholder is left.
7. **Push the branch and open the pull request:**

   ```sh
   gh pr create --base <base> --title "<title>" --body-file <file>
   ```

   Pass the body as a file. An inline `--body` breaks the code fences. Report the pull request URL to the user.

## Template

```markdown
## Summary

<One to three sentences: what changes and why.>

<One visual: a diagram, a diff sketch or a tree.>

<The ticket link, if the repository tracks work in tickets.>

## Evidence

- **Before:** <screenshot, output or failing test run>
  **After:** <screenshot, output or passing test run>

## Merge danger

**Door:** <one-way or two-way>

<What stays after a revert. Only for a one-way door.>

**Blast radius:** <none, contained or wide>

<What a merge can break, and what you checked.>
```

## Summary

Start with one to three sentences that say what changes and why. Then pick the smallest view that makes the main point clear: one visual by default, two at most. Put each visual next to the sentence that it supports. Keep only the calls, files, props, states and boundaries that the point needs. Leave out what the diff already lists, such as the changed files.

[VISUALS.md](VISUALS.md) shows each form and when it fits: pseudocode, a call tree, a component tree, a file tree, a Mermaid diagram, a diff sketch and a whole block. Put trees in a `text` fence, not a `tsx` fence, so that a formatter cannot rewrite them as code.

## Evidence

Evidence is proof from a run: the "after" run and the checks on the branch HEAD, and the "before" run on a checkout without the change. Use the strongest proof that fits the change, in this order:

1. **For a visible change, screenshots before and after.** Use the repository's browser proof if it has one. `gh` cannot upload images, so put the text output of the run in the body, list the screenshot paths under it, and ask the user to drag the images into the pull request.
2. **For a behaviour change, a test that fails before and passes after.** Give the test file, the test name, the failure line from the run before the change and the pass line after it. For a bug fix, the "before" run is the test on the code without the fix.
3. **Otherwise, the output of a command:** a script, a request or a log line.

When the change has no "before", leave out the **Before** line:

- For a refactor, the evidence is unchanged behaviour: the tests that cover the moved code pass before and after.
- For a dependency, config or docs change, give the check that proves it, such as the build, the tests or the link check.

After the proof, name each check that passed, with its count where it gives one. Name each check that you did not run or that failed, and say why.

## Merge danger

**Door.** A two-way door is a change that a revert undoes completely, such as code behind a flag that is off, a UI change or a refactor. A one-way door leaves state that a revert does not undo, such as:

- a data migration or a change to the shape of stored data,
- a delete,
- a change to a public API or a contract that other code consumes,
- a published config or a sent message.

For a one-way door, say what stays after a revert.

**Blast radius.** Use one of three words:

- `none`: no runtime behaviour changes, as in a docs or test-only change.
- `contained`: the change reaches only the feature that it names, or it is behind a flag that is off.
- `wide`: the change reaches shared code, stored data, a security check, the build or CI, or every page.

Under the word, list what a merge can break and what you checked. Take each item from the `blast-radius` run. Look at each of these areas: stored data and schemas, public contracts and their consumers, security checks, flags and config, layout on small screens, and the build and CI.
