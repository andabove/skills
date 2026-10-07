#!/bin/sh
# Copy local source skills into a target repo's .agents/skills/, the folder
# that `npx skills add` treats as canonical, and link each one for Claude
# Code in .claude/skills/, without changing the target's lock file. Only the
# named skills change. Every other folder stays as it is.
# Usage: install.sh <target-repo-root> [skill...]   (default: all skills)
set -eu

if [ "$#" -lt 1 ]; then
	echo "usage: install.sh <target-repo-root> [skill...]" >&2
	exit 1
fi

target=$1
shift

if [ ! -d "$target" ]; then
	echo "install.sh: not a directory: $target" >&2
	exit 1
fi

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

node "$repo_root/scripts/validate.mjs"

# .agents/skills holds one link per skill, group folders included.
if [ "$#" -eq 0 ]; then
	set -- $(ls "$repo_root/.agents/skills")
fi

for skill in "$@"; do
	case "$skill" in
	"" | . | .. | */*)
		echo "install.sh: not a skill name: $skill" >&2
		exit 1
		;;
	esac
	if [ ! -f "$repo_root/.agents/skills/$skill/SKILL.md" ]; then
		echo "install.sh: unknown skill: $skill" >&2
		exit 1
	fi
done

agents="$target/.agents/skills"
claude="$target/.claude/skills"

# An earlier version of this script kept the real folders in .claude/skills
# and linked .agents/skills to it. That folder can hold the target's own
# skills, so stop and print the migration command instead of moving them.
if [ -L "$agents" ]; then
	if [ "$(readlink "$agents")" != "../.claude/skills" ] || [ -L "$claude" ]; then
		echo "install.sh: $agents is a symlink this script did not make; move it aside first" >&2
		exit 1
	fi
	target_abs=$(CDPATH= cd -- "$target" && pwd)
	cat >&2 <<-EOF
		install.sh: $target uses the old layout, with .agents/skills a link to .claude/skills.
		Nothing was installed. To migrate, run this command once. It moves no folder.

		  "$repo_root/scripts/migrate-layout.sh" "$target_abs"

		Then run install.sh again.
	EOF
	exit 1
fi

mkdir -p "$agents"

if [ -L "$claude" ] && [ "$(readlink "$claude")" != "../.agents/skills" ]; then
	echo "install.sh: $claude is a symlink that does not point to ../.agents/skills" >&2
	exit 1
fi

for skill in "$@"; do
	src=$(CDPATH= cd -P -- "$repo_root/.agents/skills/$skill" && pwd)
	rm -rf "$agents/$skill"
	cp -R "$src" "$agents/$skill"
	# Claude Code reads only .claude/skills. Link the skill there, unless
	# .claude/skills is itself a link to .agents/skills.
	if [ ! -L "$claude" ]; then
		mkdir -p "$claude"
		rm -rf "$claude/$skill"
		ln -s "../../.agents/skills/$skill" "$claude/$skill"
	fi
	echo "installed $skill"
done

echo "skills-lock.json unchanged; deploy pushed changes with npx skills add"
