---
name: linear-ticket
description: Write a ticket as a short user story with testable acceptance criteria and QA notes. Use when filing a ticket or a follow-up, when rewriting one that is too long or unclear to hand to someone else, or when a ticket needs to be ready for QA.
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
- [How to set up, then what to do, then what you should see]
- [The edge case most likely to be wrong]

## Out of scope
- [The thing a reader will assume is included and is not]
```

Drop `Out of scope` when nothing is likely to be assumed. Never drop the other four.

## Rules

**Under 200 words.** If it will not fit, it is two tickets.

**Acceptance criteria are observable.** Someone who has never seen the code decides true or
false. "Onboarding works" is not a criterion. "A new member receives a direct message
within 10 minutes of being added" is.

**No rationale.** Not why this approach, not what was rejected, not what went wrong before.
That belongs in the pull request, the commit message and the code comments, where the
people it helps are already reading. Someone scanning fifteen tickets needs to know what
changes and how to check it.

If the rationale is worth keeping and has no other home, put it in a comment on the ticket.
The description is for the person picking the work up.

**Link, do not restate.** Point at the pull request, the file, the sibling ticket.

**Plain words.** No em dashes. Write the sentence a colleague would say out loud.

**The title is a sentence about the outcome**, not a component name. "A new member is
greeted within 10 minutes" beats "Onboarding queue drain".

## Anti-patterns

| Instead of | Write |
| --- | --- |
| Paragraphs on why the old design was wrong | One line of context: what is true today |
| A table comparing options you rejected | Nothing. It belongs in the pull request |
| "Refusing to guess would file writes under a customer nobody verified" | "Fails with a clear error when the tenant is unknown" |
| Quoting code comments at length | A file path |
| "The seam is documented" | "A reviewer can find X at Y" |

## Filing it

Set the team and the project. A ticket with no project is orphaned: it exists, and nobody
browsing the work finds it. Pick the project by the product the work is in, not by the kind
of work it is.

Follow the issue-tracker conventions recorded in the repository you are working in, for
statuses, labels and blocking links.

## Before you save

Read it back. Could someone who was not in this conversation pick it up, build it, and know
when they were done? If the answer needs a follow-up question, fix the ticket.
