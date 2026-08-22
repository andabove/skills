# &above skills

Shared agent skills for &above repos. Some are written here, some are adapted from upstream skill collections (see `THIRD_PARTY_NOTICES.md` and `provenance/`).

## Install

Once this repo is pushed to GitHub:

```sh
npx skills add andabove/skills
```

Until then, copy the skills you want into a repo's `.claude/skills/`, or run:

```sh
scripts/install.sh <target-repo-root> [skill...]
```

With no skill names it installs every skill. It updates the target repo's `skills-lock.json` with the installed skills and their provenance. It also wires the cross-runtime symlinks if they are missing:

```
.agents/skills -> ../.claude/skills
.cursor/skills -> ../.claude/skills
```

`.claude/skills/` is the canonical directory; the symlinks let Cursor and generic AGENTS.md agents read the same files.

In this source repository, `skills/` is canonical. `.claude/skills`, `.agents/skills`, and `.cursor/skills` point to it so each supported runtime discovers the source skills while you edit them. `CLAUDE.md` points to `AGENTS.md` so both instruction formats use the same rules.

## Updating an adapted skill

Adapted skills are edited here and reinstalled into consuming repos. Never patch a skill in a consuming repo - the next install overwrites the patch. Each adapted skill's `provenance/<name>.json` is the single provenance record and pins the upstream commit, so diffing against upstream is one command.

Run `node scripts/validate.mjs` before commit. The installer runs the same check before it changes a consuming repository.
