---
name: linear-status-update
description: Write a Linear project or initiative status update for people outside the team. Use when posting a weekly or milestone update, changing a project's health, or when an update reads like an engineering log rather than something a stakeholder can act on.
---

# Linear status update

This is the only Linear artifact read by people who do not open tickets. Write for
someone who funds the work, not someone who reviews it.

A ticket says what is being built and a comment says where one piece got to. The status
update says whether the project or initiative lands.

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

**Set `health` first, and make the first line explain it.** `onTrack` is a claim about a
date. If the date moved, or the scope did, that is the first line and not a detail in
paragraph three.

**Under 300 words.**

**Leave out milestone progress.** Linear shows milestone percentages above the update.
Restating them is the most common way these updates get long.

**Outcomes, not components.** "Customers can reset their own password" beats "M3 auth
hardening at 40%". Bold the outcome, then say in plain words what someone can now rely on.

**Write about the work, and link ticket ids.** Link a ticket when a reader might want to
follow it, and keep ids out of the subject of a sentence.

**Keep engineering detail on the ticket.** File paths, type names, tool output and code
blocks belong there, where engineers already read.

**Give numbers where you have them.** "Roughly 20 fewer support tickets a week" says more
than a paragraph of description. If a number is an estimate, say what would turn it into a fact.

**Risks are things that could still go wrong**, each with what is being done about it.
A risk with no mitigation is an escalation, and belongs in `Needs a decision` instead.

**An initiative update is written across its projects.** The first line is about the
initiative's date, and each `Since last time` item names the project the outcome came from.

**Plain words, with commas and full stops where an em dash might go.** Write it for
somebody who has never used the product and receives it forwarded.

## Anti-patterns

| Instead of | Write |
| --- | --- |
| Pasted eval or test output | One sentence on what the tests now prove, for example "Every release now runs the checkout tests" |
| "Two design corrections worth knowing", then two paragraphs of type detail | Nothing. Put it on the ticket |
| A list of nine new ticket numbers | "Nine follow-ups filed" with one link to the project |
| "M1 essentially. Auth service ported, the four adapter interfaces, the retry queue…" | One sentence naming what the milestone now lets someone do |
| "Each customer's data is kept separate" with no cost | The same, plus what it costs, for example "and it adds nothing to the monthly bill" |

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
