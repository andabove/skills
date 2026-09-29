---
name: linear-ticket
description: Write or rewrite a Linear ticket for the &above workspace as a short user story with testable acceptance criteria and QA notes. Use when filing a ticket, creating a follow-up, or when an existing ticket is too long or unclear for a stakeholder to follow.
---

# Linear ticket

A ticket is read by someone who was not in the conversation. Write for them.

## The shape

Six parts, in this order. Nothing else.

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

Drop `Out of scope` when nothing is likely to be assumed. Never drop the other five.

## Rules

**Under 200 words in total.** If it will not fit, the ticket is two tickets.

**Acceptance criteria are observable.** Someone who has never seen the code must be able
to decide true or false. "Onboarding works" is not a criterion. "A new member receives a
DM within 10 minutes of being added" is.

**No rationale.** Not why the approach was chosen, not what was rejected, not what went
wrong last time. That belongs in the PR, the commit message and the code comments, where
the people it helps are already reading. A stakeholder scanning fifteen tickets needs to
know what changes and how to check it.

**Link, don't restate.** Point at the PR, the file, the sibling ticket. Do not summarise
them.

**Plain words.** No em dashes. No "the whole point is". No paragraph that argues with
itself. Write the sentence a colleague would say out loud.

**Title is a sentence about the outcome**, not a component name. "A new member is greeted
within 10 minutes" beats "Onboarding queue drain".

## Anti-patterns, with the fix

| Instead of | Write |
|---|---|
| Three paragraphs on why the old design was wrong | One line in Context: what is true today |
| A table comparing options you rejected | Nothing. It is a PR concern |
| "Refusing to guess: picking a tenant here would file…" | "Fails with a clear error when the tenant is unknown" |
| Quoting code comments at length | A file path |
| Criteria like "the seam is documented" | "A reviewer can find X at Y" |

## Before you file

**Check the defect is still a defect.** Against the *current published* version, not the
one this repository pins: a bug report written from a pinned version can be months of
releases behind, and the fix may already be in the changelog. Unpack the published package
and read the code rather than trusting either the docs or a comment claiming a capability
is missing.

**If the evidence shows the fix is in reach, ship the fix.** Gathering proof for a ticket
often turns up the answer; when it does, the ticket is the more expensive output. File one
only for what you are not going to do now.

## Filing it

Use the Linear MCP tools. Always set `team` and `project` — an issue without a project is
orphaned. Pick the project by the product the work is in, not the kind of work.

Check `~/.claude/docs/agents/issue-tracker.md` for this workspace's conventions: statuses,
labels, blocking edges, and which project is which.

## Before you save

**Rewriting an existing ticket is editorial, not a scope decision.** Diff the meaning as
well as the prose. A house-style rewrite that narrows, widens, or inverts what is being
asked for is a different ticket wearing the same number, and the person who filed it will
not reread it to catch you. When the meaning moves, confirm with them before saving.

Read it back and ask: could someone who was not in this conversation pick this up, build
it, and know when they were done? If the answer needs a follow-up question, fix the
ticket, not the answer.
