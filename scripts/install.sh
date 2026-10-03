#!/bin/sh
# Copy local source skills into a target repo's .agents/skills/, the folder
# that `npx skills add` treats as canonical, and link each one for Claude
# Code in .claude/skills/, without changing the target's lock file.
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
	if [ ! -f "$repo_root/.agents/skills/$skill/SKILL.md" ]; then
		echo "install.sh: unknown skill: $skill" >&2
		exit 1
	fi
done

agents="$target/.agents/skills"
claude="$target/.claude/skills"

# An earlier version of this script kept the real folders in .claude/skills
# and linked .agents/skills to it. Move those folders to .agents/skills.
if [ -L "$agents" ]; then
	if [ "$(readlink "$agents")" != "../.claude/skills" ] || [ -L "$claude" ]; then
		echo "install.sh: $agents is a symlink this script did not make; move it aside first" >&2
		exit 1
	fi
	rm "$agents"
	mkdir -p "$agents"
	for dir in "$claude"/*; do
		[ -d "$dir" ] && [ ! -L "$dir" ] || continue
		name=$(basename "$dir")
		mv "$dir" "$agents/$name"
		ln -s "../../.agents/skills/$name" "$claude/$name"
		echo "moved $name to .agents/skills"
	done
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
