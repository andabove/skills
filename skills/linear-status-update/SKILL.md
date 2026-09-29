---
name: linear-status-update
description: Write a Linear project or initiative status update for people outside the team. Use when posting a weekly or milestone update, changing a project's health, or when an update reads like an engineering log rather than something a stakeholder can act on.
---

# Linear project status update

This is the only Linear artifact read by people who do not open tickets. Write for
someone who funds the work, not someone who reviews it.

Completes the set: `linear-ticket` says what is being built, `linear-comment` says where
one piece got to, this says whether the project lands.

## The shape

```markdown
[One line: on track for <date>, or what changed about that.]

## Since last time
**[What changed, as an outcome.]** [One or two sentences on what it means.]

**[The next one.]** [Same.]

## Next
[The single largest piece of work now in front of the team.]

## Needs a decision
- [The thing that is waiting on a person rather than on code]
```

Drop `Needs a decision` when nothing is waiting. Say so in the first line instead.

## Rules

**Set `health` first, and make the first line earn it.** `onTrack` is a claim about a
date. If the date moved, or the scope did, that is the first line and not a detail in
paragraph three.

**Under 300 words.**

**Linear already draws the progress diff.** Milestone percentages appear above your text
automatically. Restating them is the most common way these updates get long.

**Outcomes, not components.** "The safety layer is in" beats "M5 telemetry and hardening
at 40%". Bold the outcome, then say in plain words what it now means someone can rely on.

**A ticket id is never the subject of a sentence.** Link one when a reader might want to
follow it. Do not build the update out of them.

**No file paths, type names, tool output or code blocks.** If the detail matters to
engineers, it belongs on the ticket, and the ticket is where engineers are already
reading.

**Numbers where you have them.** "Roughly £30-55 a month for a dormant client" is worth a
paragraph of description. If a number is an estimate, say what would turn it into a fact.

**Risks are things that could still go wrong**, each with what is being done about it.
A risk with no mitigation is an escalation, and belongs in `Needs a decision`.

**Plain words. No em dashes.** Read it as though it will be forwarded to somebody who has
never used the product.

## Anti-patterns

| Instead of | Write |
| --- | --- |
| Pasted eval or test output | "It is a real test now rather than an aspiration" |
| "Two design corrections worth knowing", then two paragraphs of type detail | Nothing. Put it on the ticket |
| A list of nine new ticket numbers | "Nine follow-ups filed" with one link to the project |
| "M1 essentially. SOUL ported, the four provider interfaces, the erasure registry…" | One sentence naming what the milestone now lets someone do |
| "Keeping clients separate is enforced by the platform" with no cost | The same, plus "and it costs essentially nothing extra" |

## Filing it

`save_status_update` with `type: "project"`, the project name, `health`, and `body`.
Health values are `onTrack`, `atRisk`, `offTrack`.

Use the project the work is in, per `~/.claude/docs/agents/issue-tracker.md`.

## Before you save

Read the first line and the health together. If somebody could read only those two and be
misled about whether this project lands on its date, the update is wrong regardless of
what the rest says.
