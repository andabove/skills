#!/bin/sh
# One-time migration for a target repo that an earlier install.sh set up,
# with the real folders in .claude/skills and .agents/skills a link to it.
# Make .agents/skills a folder and link each .claude/skills entry into it,
# so every runtime still sees the same skills and no folder moves. The next
# install.sh run replaces the links for the skills it copies.
# Usage: migrate-layout.sh <target-repo-root>
set -eu

if [ "$#" -ne 1 ]; then
	echo "usage: migrate-layout.sh <target-repo-root>" >&2
	exit 1
fi

target=$1
agents="$target/.agents/skills"
claude="$target/.claude/skills"

if [ ! -L "$agents" ] || [ "$(readlink "$agents")" != "../.claude/skills" ] || [ -L "$claude" ]; then
	echo "migrate-layout.sh: $agents is not a link to ../.claude/skills; nothing to migrate" >&2
	exit 1
fi

rm "$agents"
mkdir "$agents"
for path in "$claude"/*; do
	[ -e "$path" ] || [ -L "$path" ] || continue
	name=$(basename "$path")
	ln -s "../../.claude/skills/$name" "$agents/$name"
	echo "linked .agents/skills/$name to .claude/skills/$name"
done
