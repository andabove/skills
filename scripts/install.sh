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

node "$repo_root/scripts/validate.mjs"

if [ "$#" -eq 0 ]; then
	set -- $(ls "$repo_root/skills")
fi

for dir in .agents .cursor; do
	skill_link="$target/$dir/skills"
	if [ -e "$skill_link" ] || [ -L "$skill_link" ]; then
		if [ ! -L "$skill_link" ] || [ "$(readlink "$skill_link")" != "../.claude/skills" ]; then
			echo "install.sh: existing path does not point to ../.claude/skills: $skill_link" >&2
			exit 1
		fi
	fi
done

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

node "$repo_root/scripts/update-lock.mjs" \
	"$target/skills-lock.json" \
	"$repo_root/provenance" \
	"$@"
echo "updated skills-lock.json"

for dir in .agents .cursor; do
	mkdir -p "$target/$dir"
	if [ ! -L "$target/$dir/skills" ]; then
		ln -s ../.claude/skills "$target/$dir/skills"
		echo "linked $dir/skills -> ../.claude/skills"
	fi
done
