---
name: linear-status-update
description: Write a Linear project or initiative status update for people outside the team. Use when posting a weekly or milestone update, changing a project's health, or when an update reads like an engineering log rather than something a stakeholder can act on.
---

# Linear status update

This is the only Linear artifact read by people who do not open tickets. Write for
someone who funds the work, not someone who reviews it.

Completes the set: `linear-ticket` says what is being built, `linear-comment` says where
one piece got to, this says whether the project or initiative lands.

## The shape

```markdown
[One line: on track for <date>, or what changed about that.]

## Since last time
**[What changed, as an outcome.]** [One or two sentences on what it means.]

**[The next one.]** [Same.]

## Next
[The single largest piece of work now in front of the team.]

## Risks
- [What could still go wrong] - [what is being done about it]

## Needs a decision
- [The thing that is waiting on a person rather than on code]
```

Drop `Risks` when there are none, and `Needs a decision` when nothing is waiting.

## Rules

**Set `health` first, and make the first line earn it.** `onTrack` is a claim about a
date. If the date moved, or the scope did, that is the first line and not a detail in
paragraph three.

**Under 300 words.**

**Linear already draws the progress diff.** Milestone percentages appear above your text
automatically. Restating them is the most common way these updates get long.

**Outcomes, not components.** "Customers can reset their own password" beats "M3 auth
hardening at 40%". Bold the outcome, then say in plain words what it now means someone can rely on.

**A ticket id is never the subject of a sentence.** Link one when a reader might want to
follow it. Do not build the update out of them.

**No file paths, type names, tool output or code blocks.** If the detail matters to
engineers, it belongs on the ticket, and the ticket is where engineers are already
reading.

**Numbers where you have them.** "Roughly 20 fewer support tickets a week" is worth a
paragraph of description. If a number is an estimate, say what would turn it into a fact.

**Risks are things that could still go wrong**, each with what is being done about it.
A risk with no mitigation is an escalation, and belongs in `Needs a decision` instead.

**An initiative update is written across its projects.** The first line is about the
initiative's date, and each `Since last time` item names the project the outcome came from.

**Plain words. No em dashes.** Read it as though it will be forwarded to somebody who has
never used the product.

## Anti-patterns

| Instead of | Write |
| --- | --- |
| Pasted eval or test output | "It is a real test now rather than an aspiration" |
| "Two design corrections worth knowing", then two paragraphs of type detail | Nothing. Put it on the ticket |
| A list of nine new ticket numbers | "Nine follow-ups filed" with one link to the project |
| "M1 essentially. Auth service ported, the four adapter interfaces, the retry queue…" | One sentence naming what the milestone now lets someone do |
| "Each customer's data is kept separate" with no cost | The same, plus "and it costs essentially nothing extra" |

## Before you save

Read the first line and the health together. If somebody could read only those two and be
misled about whether this work lands on its date, the update is wrong regardless of
what the rest says.

## Filing it

Find the project or initiative the work belongs to in the `## Linear` section of the
repository's agent instructions. If there is no such section, run
[the setup](references/linear-setup.md) first.

Use `save_status_update` with `type`, `health`, and `body`, plus the target:

- A project: `type: "project"` and `project` set to its name.
- An initiative: `type: "initiative"` and `initiative` set to its name.

Health values are `onTrack`, `atRisk`, `offTrack`.
