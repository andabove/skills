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

new="$agents.new"
if [ -e "$new" ] || [ -L "$new" ]; then
	echo "migrate-layout.sh: $new exists from a run that stopped part way; remove it and run again" >&2
	exit 1
fi

# Build the links in a sibling folder and swap it in as the last step. On
# any failure, delete that folder and put the old link back if it is gone,
# so the target is as it was and a second run can start again.
trap 'rm -rf "$new"; [ -e "$agents" ] || [ -L "$agents" ] || ln -s ../.claude/skills "$agents"' EXIT
trap 'exit 1' HUP INT TERM

mkdir "$new"
for path in "$claude"/*; do
	[ -e "$path" ] || [ -L "$path" ] || continue
	name=$(basename "$path")
	ln -s "../../.claude/skills/$name" "$new/$name"
done
rm "$agents"
mv "$new" "$agents"
trap - EXIT HUP INT TERM

for path in "$agents"/*; do
	[ -L "$path" ] || continue
	name=$(basename "$path")
	echo "linked .agents/skills/$name to .claude/skills/$name"
done
