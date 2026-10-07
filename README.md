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

The skills land side by side, the same as skills installed one at a time.

## Where installed skills live

`.agents/skills/` is the canonical folder, as `npx skills add` makes it: one real folder per skill. Codex, Cursor and other agents that follow the `.agents` convention read it directly. Claude Code reads only `.claude/skills/`, so each skill also has a link there:

```text
.agents/skills/<name>/                      the skill
.claude/skills/<name> -> ../../.agents/skills/<name>
```

## Test a local source change

Before you push a shared-skill change, copy it from a local checkout into a consuming repository:

```sh
scripts/install.sh <target-repo-root> [skill...]
```

With no skill names, the script copies every skill. It validates this repository, copies each named skill to `.agents/skills/<name>`, and links it in `.claude/skills/`. It changes no other folder, so the consuming repository's own skills stay where they are.

A named skill replaces only a link, a copy that the script made, or a copy that the consuming repository's `skills-lock.json` lists from `andabove/skills`. The script marks each copy it makes with a `.andabove-install` file. If `.agents/skills/<name>` or `.claude/skills/<name>` holds any other folder, the script lists each such path and installs nothing. To replace those folders, run the script again with `--force`:

```sh
scripts/install.sh --force <target-repo-root> [skill...]
```

The script does not change the consuming repository's `skills-lock.json`. Use the GitHub install command after you push the source change.

An earlier version of the script kept the real folders in `.claude/skills/` and made `.agents/skills` a link to that folder. On that layout, `install.sh` installs nothing and prints a one-time migration command:

```sh
scripts/migrate-layout.sh <target-repo-root>
```

The migration moves no folder. It makes `.agents/skills/` a real folder and links each entry of `.claude/skills/` into it, so each runtime sees the same skills as before. If the migration fails part way, it puts the target back as it was. Then run `install.sh` again. It replaces the links of the skills it installs with copies. A copy that the earlier script made carries no mark, so if `skills-lock.json` does not list it, pass `--force` to replace it.

## Layout of this repository

`skills/` is canonical. A skill is `skills/<name>/`, or `skills/<group>/<name>/` inside a group folder that has no `SKILL.md` of its own. Runtimes read skills one level deep, so `.agents/skills/` holds one symlink per skill, and `.claude/skills` and `.cursor/skills` point to `.agents/skills`. After you add, move or rename a skill, run `node scripts/link-skills.mjs`. `node scripts/validate.mjs` fails until the links match. `CLAUDE.md` points to `AGENTS.md` so both instruction formats use the same rules.

## Updating an adapted skill

Adapted skills are edited here and deployed through the GitHub install command. Never patch a skill in a consuming repo - the next install overwrites the patch. Each adapted skill's `provenance/<name>.json` is the single provenance record and pins the upstream commit, so diffing against upstream is one command.

Run `node scripts/validate.mjs` before commit. The installer runs the same check before it changes a consuming repository.
