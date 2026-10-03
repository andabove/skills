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

Install a whole group, such as the eleven Effect skills in `skills/effect/`, by its folder:

```sh
npx skills add andabove/skills/skills/effect --skill '*' --agent claude-code codex cursor -y
```

The skills land side by side in `.claude/skills/`, the same as skills installed one at a time.

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

In this source repository, `skills/` is canonical. A skill is `skills/<name>/`, or `skills/<group>/<name>/` inside a group folder that has no `SKILL.md` of its own. Runtimes read skills one level deep, so `.claude/skills/` holds one symlink per skill, and `.agents/skills` and `.cursor/skills` point to `.claude/skills`. After you add, move or rename a skill, run `node scripts/link-skills.mjs`. `node scripts/validate.mjs` fails until the links match. `CLAUDE.md` points to `AGENTS.md` so both instruction formats use the same rules.

## Updating an adapted skill

Adapted skills are edited here and deployed through the GitHub install command. Never patch a skill in a consuming repo - the next install overwrites the patch. Each adapted skill's `provenance/<name>.json` is the single provenance record and pins the upstream commit, so diffing against upstream is one command.

Run `node scripts/validate.mjs` before commit. The installer runs the same check before it changes a consuming repository.
