---
name: reflect
description: Run three independent reviews of the active session, surface durable learnings, and route each to a concrete skill edit. Use when the user says reflect.
---

# Reflect

Mine the current conversation for durable learnings, then route them into skill edits.

## When to invoke

Run when the user says "reflect" or "/reflect". If the conversation is trivial, off-topic, or already covered by a skill that the parent followed correctly, report that there is no durable learning and stop. One-offs are not learnings.

## Process

### 1. Locate the active transcript

Use the runtime's current-session transcript API or session store when it exposes one. Resolve only the transcript for the current project and session. Do not scan unrelated projects or sessions. Confirm that the opening user message matches this session. If the runtime does not expose a safe transcript path, write a tight digest of the active conversation and pass that instead. This step is complete when all reviewers can read the same session evidence.

### 2. Spawn three reviewers in parallel

Start three general-purpose review subagents in parallel when the runtime permits it. Use full-tool agents because reviewers can need read access to context named in the session. The prompt forbids writes; the parent applies edits. If parallel dispatch is unavailable, run the three subagents in sequence. If subagents are unavailable, run three separate manual review passes yourself against the same transcript evidence and keep the outputs separate by lens.

| Lens | Model choice | Prompt template |
|---|---|---|
| Judgment | strongest available reasoning model | `references/judgment-reviewer.md` |
| Tooling | strongest available coding or tool-use model | `references/tooling-reviewer.md` |
| Divergent | a different available model when possible | `references/divergent-reviewer.md` |

Use the runtime's available model list. Do not assume fixed model names. Pass each template verbatim, and substitute the transcript path or digest where marked. Reviewers return findings in the subagent response. If you must run the passes yourself, use the same templates as checklists and record three separate outputs before you synthesize.

### 3. Synthesize

Start one full-tool general-purpose subagent on the strongest available reasoning model. The synthesizer's quality check includes spot-verifying citations, which can require connected tools. Use `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. The synthesizer returns a structured Accepted / Rejected / Backlog list. If subagents are unavailable, apply the same synthesizer prompt yourself to the three manual review outputs.

### 4. Structural enforcement check

Sanity-check the synthesizer's Accepted list. For any item that would be enforced more reliably by a lint rule, script, metadata flag, or runtime check, move it from Accepted to Backlog.

### 5. Apply

Before applying any Accepted edit, present the synthesizer's full Accepted/Rejected/Backlog output to the user and wait for explicit approval. The user picks which subset to apply and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

Backlog items file to whatever devex / backlog tracker your team uses automatically. Only the Accepted list waits for approval.

For each approved Accepted item, find the skill's canonical source from the consuming repository's agent documentation or lock file. Edit that source, not a generated or installed copy. Then follow the Routing field:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): parent does directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): edit the canonical skill source, following the `writing-for-agents` skill if it is installed.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): rewrite the `description` frontmatter in that skill's `SKILL.md` so the missed trigger fires next time.
- `new skill: <kebab-name>`: create it in the repository's canonical skill source with `name` and `description` frontmatter, following `writing-for-agents` if it is installed.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done. Skip this step if it doesn't.

### 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
