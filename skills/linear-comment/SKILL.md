---
name: linear-comment
description: Write a comment on a Linear issue as a status record against its acceptance criteria and QA notes. Use when reporting progress, handing work to QA, recording a decision or a gap, or when a comment reads like a chat reply rather than something a stakeholder can act on.
---

# Linear comment

A comment is read by someone catching up on the ticket. It is not a reply to the person
who asked you. Write the update, not the conversation.

Pairs with the `linear-ticket` skill: the description says what is being built, the
comment says where it got to.

## The shape

```markdown
[One line: the current state of this ticket.]

## Against the criteria
- [x] [Criterion, as written on the ticket] - [how it is met, or the evidence]
- [ ] [Criterion not yet met] - [what is missing]

## QA
[What was verified and how. Or what QA should do now, if it is ready for them.]

## Gaps
- [Anything that differs from the ticket, is still open, or was found on the way]
```

Drop `Gaps` when there are none. Say so in the first line instead.

## Rules

**Under 250 words.**

**Quote the criteria from the ticket.** Not a summary of them. A reader should be able to
tick boxes against the description without translating.

**Ticked means demonstrated.** If it is met but unverified, leave it unticked and say what
would verify it. A tick nobody has seen fail is not evidence.

**No second person.** "Review and send when you are happy with it" is a message to one
person; the next reader does not know who or what. Write "Drafted, not filed. Needs a
reviewer before it goes." Same fact, addressed to the ticket.

**No conversation artefacts.** "So what is left is", "One correction:", "Re-verified"
without saying against what. These are turns in a dialogue, and the dialogue is not on the
ticket.

**Corrections are stated once, plainly.** "An earlier comment said X; that was wrong
because Y." Not a running account of how the understanding changed.

**Link, do not restate.** The pull request, the file, the sibling ticket.

**Plain words. No em dashes.**

## Anti-patterns

| Instead of | Write |
| --- | --- |
| "Step 2 is done; step 1 is drafted, not filed" | "Blocked on an upstream issue that is drafted and not filed" |
| "Review and send when you are happy" | "Needs a reviewer before it is filed" |
| Three paragraphs on why the workaround is awkward | One gap line, and the detail in the linked draft |
| "Re-verified against the installed version" | "Checked against [package] [version]: [what changed, or that nothing did]" |
| A wall of type signatures | The file and line, once |

## Before you save

Read the first line alone. Does it tell someone scanning the ticket whether this is done,
blocked, or needs them? If not, rewrite it before anything else.

## Filing it

Post with `save_comment` on the issue, using `issueId`.

**Every comment sets the status.** List the issue's team statuses each time, because they
change, and move the issue to the one that matches the first line, which is the reason for
it. When the comment hands work to QA and the team has no QA status, pick the nearest one
and name in the comment who should test it.
