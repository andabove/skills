---
name: evidence-discipline
description: Binding claims to their evidence. Use when writing a report or check-in from data, summarizing metrics or results, stating that work succeeded or a number moved, or reviewing a report before it lands.
---

Reference for any writing that turns data into claims: a report, a check-in, a summary, a "done" message. The failure it closes is **overclaiming**: prose that asserts more than the evidence supports - a direction stated without its numbers, a stat with no source, a guess dressed as a finding. The discipline is one rule applied everywhere: a claim is only as strong as what you can show a skeptic.

## Every claim names its source

A claim earns its place by naming what produced it: the query, the command, the file, the tool result. A number is false until the command that regenerates it is named - not suspect, false, because an unregenerable number can never be checked and never corrected.

- Overclaimed: "Organic pageviews grew strongly this week."
- Evidenced: "Organic pageviews: 113 for Aug 11-17 (analytics dashboard, organic segment, weekly view)."

If the source is a tool call you made, name the tool and the parameters that matter (segment, date window, filter). If it is a file, name the file. A reader should be able to rerun every number in the report.

## Comparisons carry both operands

A comparison is four facts: the baseline value, the current value, and the source of each - same units, same window. Write the direction only beside the two numbers, because direction alone is where reversals hide. A real failure shape: 113 current against a 116 baseline, written as "first week above the baseline" in three places, because the direction was asserted and the operands never sat next to it.

- Overclaimed: "Traffic is above baseline."
- Evidenced: "113 pageviews this week vs the 116 weekly baseline - 3 below. Both from the same organic segment, weekly windows."

When the two windows or units differ, the comparison is not yet a comparison; say what still has to be normalised, or drop it.

## Inference is labeled inference

"X rose, likely because Y" - the rise is observed, the "because" is a guess until traced to evidence. Keep the two visibly apart: state the observation with its source, then mark the causal step as inference ("consistent with", "one plausible cause", "untested"). An inference is legitimate content; an inference wearing a finding's clothes is the bug.

- Overclaimed: "Signups rose 12% because the new pricing page landed."
- Evidenced: "Signups rose from 250 to 280 (billing export, week-over-week). The pricing page shipped mid-week - a plausible cause, not traced. Nothing else changed in the funnel that we know of."

## A null or negative result is a result

Report it plainly, with the same sourcing as a positive one. "The experiment showed no lift: 2.1% vs 2.0% conversion, within noise" is a complete, useful finding. Rewriting it as motion - "groundwork laid", "early signals encouraging", "directionally positive" - is overclaiming with extra steps. The reader's decisions depend on the flat result being stated flat.

## Hedges that track evidence survive editing

Two different objects share the word "hedge":

- An **evidence hedge** narrows a claim to exactly what the data shows: "in the seven pages sampled", "as of Friday's crawl", "for the branded queries only". These are load-bearing. They survive every editing pass, including style passes that cut hedging.
- A **filler hedge** softens without informing: "somewhat", "it seems that perhaps", "arguably". Cut these freely.

The test: delete the hedge and reread. If the claim now says more than the evidence supports, the hedge was evidence and goes back in.

## The skeptic pass

Before a report lands, one pass over every claim: **what would I show a skeptic?**

- A source you can name - the claim stands, with the source beside it.
- Only an inference - the claim stands, labeled as inference.
- Nothing - cut the claim, or mark it unverified.

The pass is per-claim and exhaustive: every number, every direction word (up, down, above, below, improved), every "because". Direction words and "because" are where unbacked claims concentrate; check those first.

## Evidence wins

When the evidence and the narrative conflict, the narrative changes. Rewrite the conclusion from the numbers, even when the numbers arrived after the prose and the prose read better. A report's job is to be the thing a reader can act on without rechecking it.
