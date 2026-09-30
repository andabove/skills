---
name: linear-ticket
description: Write or rewrite a Linear ticket as a short user story with testable acceptance criteria and QA notes. Use when filing a ticket, creating a follow-up, or when an existing ticket is too long or unclear for a stakeholder to follow.
---

# Linear ticket

A ticket is read by someone who was not in the conversation. Write for them.

## The shape

Five parts, in this order. Nothing else.

```markdown
**As a** [who] **I want** [what] **so that** [why].

## Context
[1-3 sentences. What is true today that makes this worth doing.]

## Acceptance criteria
- [ ] [Observable outcome someone can check]
- [ ] [Observable outcome someone can check]

## QA notes
- [How to set up, then what to click, then what you should see]
- [The edge case most likely to be wrong]

## Out of scope
- [The thing a reader will assume is included and is not]
```

Drop `Out of scope` when nothing is likely to be assumed. Never drop the other four.

## Rules

**Under 200 words in total.** If it will not fit, the ticket is two tickets.

**Acceptance criteria are observable.** Someone who has never seen the code must be able
to decide true or false. "Onboarding works" is not a criterion. "A new member receives a
DM within 10 minutes of being added" is.

**Say what changes and how to check it.** Why an approach was chosen, what was rejected,
and what went wrong before belong in the PR, the commit message and the code comments,
where the people they help already read. A stakeholder scanning fifteen tickets needs only
the change and the check.

**Link, don't restate.** Point at the PR, the file, the sibling ticket. Do not summarise
them.

**Plain words.** Write the sentence a colleague would say out loud, with commas and full
stops where an em dash might go.

**Title is a sentence about the outcome**, not a component name. "A new member is greeted
within 10 minutes" beats "Onboarding queue drain".

## Anti-patterns, with the fix

| Instead of | Write |
|---|---|
| Three paragraphs on why the old design was wrong | One line in Context: what is true today |
| A table comparing options you rejected | Nothing. It is a PR concern |
| "Refusing to guess: picking an account here would file…" | "Fails with a clear error when the account is unknown" |
| Quoting code comments at length | A file path |
| Criteria like "the seam is documented" | "A reviewer can find X at Y" |

## Before you save

**Rewriting an existing ticket is editorial, not a scope decision.** Diff the meaning as
well as the prose. A house-style rewrite that narrows, widens, or inverts what is being
asked for turns it into a different ticket under the same number, and the person who
filed it will not reread it to catch the change. When the meaning moves, confirm with them before saving.

Read it back and ask: could someone who was not in this conversation pick this up, build
it, and know when they were done? If the answer needs a follow-up question, fix the
ticket, not the answer.

## Filing it

Take the team, project, estimate scale, and labels from the `## Linear` section of the
repository's agent instructions. If there is no such section, run
[the setup](references/linear-setup.md) first. The section says what the team has; this
skill says how to use it, whatever earlier tickets did.

Use the Linear MCP tools and set every field below. An unset field is a question someone
has to come back and ask.

- **Team and project.** An issue without a project is orphaned. Pick the project by the
  product the work is in, not the kind of work.
- **Status.** List the team's statuses each time, because they change, and pick the one
  that matches where the work is. Tell the user which status you chose and why.
- **Priority.** From the impact in Context: Urgent when something is broken for users now,
  High when it blocks other work, Low for polish, Medium otherwise.
- **Estimate.** From the team's scale, when it has one.
- **Labels.** One type label, plus the repository label when there is one.
- **Parent and order.** When the work belongs to an existing parent issue, file it as a
  sub-issue with `parentId`. When it must land before or after another issue, set `blocks`
  or `blockedBy`.

Leave milestone and cycle unset, because the team plans those.
