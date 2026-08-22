---
name: commit-messages
description: Write repository-consistent Git commit messages. Use before creating, amending, squashing, or proposing a commit.
---

# Commit messages

Write a one-line subject that names the change and its local area.

## Build the subject

1. Inspect the staged change with `git diff --cached --stat` and `git diff --cached`. If no change is staged, inspect the change that the user wants to commit.
2. Read the repository instructions and recent subjects:

   ```sh
   git log --no-merges --format=%s -30
   ```

3. Match the repository vocabulary. Use this form by default:

   ```text
   <type>(<scope>): <summary>
   ```

4. Check the subject against every staged file. The type must state the intent. The scope must name the owning area. The summary must cover the complete change.

## Choose the type and scope

- Reuse types from recent history. Common defaults are `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, and `chore`. Keep additional types that recent history uses consistently.
- Use the smallest stable area as the scope. Prefer an established application, package, service, or workflow name from recent history.
- Omit the scope only when the change applies to the whole repository or the history has no scope pattern.
- Keep ticket numbers and branch names out of the scope unless the repository uses them as scopes.

## Write the summary

- Start with a lowercase command verb, except when a proper name or acronym must start the summary.
- State the result, not the work process.
- Keep the subject on one line. Aim for 72 characters or fewer, but keep the meaning clear.
- End without a period.

If one subject cannot describe the staged change, propose separate commits. Do not hide separate changes behind a broad scope or a vague summary.

Examples:

```text
feat(api): add the account status endpoint
fix(auth): preserve the session after refresh
docs(cli): clarify the configuration command
chore(build): add the staged-file check
```
