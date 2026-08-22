#!/bin/sh
# Install skills from this repo into a target repo's .claude/skills/
# and wire the cross-runtime symlinks.
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

if [ "$#" -eq 0 ]; then
	set -- $(ls "$repo_root/skills")
fi

mkdir -p "$target/.claude/skills"

for skill in "$@"; do
	src="$repo_root/skills/$skill"
	if [ ! -f "$src/SKILL.md" ]; then
		echo "install.sh: unknown skill: $skill" >&2
		exit 1
	fi
	rm -rf "$target/.claude/skills/$skill"
	cp -R "$src" "$target/.claude/skills/$skill"
	echo "installed $skill"
done

for dir in .agents .cursor; do
	mkdir -p "$target/$dir"
	if [ ! -e "$target/$dir/skills" ]; then
		ln -s ../.claude/skills "$target/$dir/skills"
		echo "linked $dir/skills -> ../.claude/skills"
	fi
done
