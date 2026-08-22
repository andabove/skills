---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

Use a **background agent** to do the research when the runtime supports it, so you keep working while it reads. If the runtime has no background or subagent capability, do the research in the current session and state that you stayed inline.

Its job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it to the consuming repo's docs, where the repo already keeps such notes; match the existing convention (e.g. `docs/research/` or the repo's report convention), and if there is none, default to `docs/research/` and say where.
