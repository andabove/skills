# &above skills

Shared agent skills for &above repos. Some are written here, some are adapted from upstream skill collections (see `THIRD_PARTY_NOTICES.md` and `provenance/`).

## Install

List the available skills:

```sh
npx skills add andabove/skills --list
```

Install one skill for Claude Code, Codex, and Cursor:

```sh
npx skills add andabove/skills --skill <name> --agent claude-code codex cursor -y
```

Use `--skill '*'` to install every skill.

## Test a local source change

Before you push a shared-skill change, copy it from a local checkout into a consuming repository:

```sh
scripts/install.sh <target-repo-root> [skill...]
```

With no skill names, the script copies every skill. It validates this repository and wires the cross-runtime symlinks if they are missing. It does not change the consuming repository's `skills-lock.json`. Use the GitHub install command after you push the source change.

```
.agents/skills -> ../.claude/skills
.cursor/skills -> ../.claude/skills
```

`.claude/skills/` is the canonical directory; the symlinks let Cursor and generic AGENTS.md agents read the same files.

In this source repository, `skills/` is canonical. `.claude/skills`, `.agents/skills`, and `.cursor/skills` point to it so each supported runtime discovers the source skills while you edit them. `CLAUDE.md` points to `AGENTS.md` so both instruction formats use the same rules.

## Updating an adapted skill

Adapted skills are edited here and deployed through the GitHub install command. Never patch a skill in a consuming repo - the next install overwrites the patch. Each adapted skill's `provenance/<name>.json` is the single provenance record and pins the upstream commit, so diffing against upstream is one command.

Run `node scripts/validate.mjs` before commit. The installer runs the same check before it changes a consuming repository.
