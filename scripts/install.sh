#!/bin/sh
# Copy local source skills into a target repo's .agents/skills/, the folder
# that `npx skills add` treats as canonical, and link each one for Claude
# Code in .claude/skills/, without changing the target's lock file. Only the
# named skills change. Every other folder stays as it is.
# A named skill replaces only a link, a copy that this script marked, or a
# copy that the target's skills-lock.json lists from andabove/skills. Any
# other folder at its path stops the install, unless --force is passed.
# Usage: install.sh [--force] <target-repo-root> [skill...]   (default: all skills)
set -eu

usage="usage: install.sh [--force] <target-repo-root> [skill...]"
force=0
for arg do
	shift
	if [ "$arg" = --force ]; then
		force=1
	else
		set -- "$@" "$arg"
	fi
done

if [ "$#" -lt 1 ]; then
	echo "$usage" >&2
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

if [ -L "$claude" ] && [ "$(readlink "$claude")" != "../.agents/skills" ]; then
	echo "install.sh: $claude is a symlink that does not point to ../.agents/skills" >&2
	exit 1
fi

# install.sh marks each copy it makes, so a later run can replace it.
marker=.andabove-install

# Skills that the target's lock file lists from this repository, one a line.
lock="$target/skills-lock.json"
locked=""
if [ -f "$lock" ]; then
	locked=$(node -e '
		let lock;
		try {
			lock = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
		} catch (error) {
			console.error(`install.sh: cannot read ${process.argv[1]}: ${error.message}`);
			process.exit(1);
		}
		for (const [name, entry] of Object.entries(lock.skills ?? {})) {
			if (entry?.source === "andabove/skills") console.log(name);
		}
	' "$lock")
fi

# Find every path that a named skill would replace and that holds a file
# or a real folder this script or the lock file does not account for.
blocked=""
for skill in "$@"; do
	if printf '%s\n' "$locked" | grep -Fqx -- "$skill"; then
		continue
	fi
	for path in "$agents/$skill" "$claude/$skill"; do
		if [ "$path" = "$claude/$skill" ] && [ -L "$claude" ]; then
			continue
		fi
		if [ -L "$path" ] || [ ! -e "$path" ] || [ -f "$path/$marker" ]; then
			continue
		fi
		blocked="$blocked  ${path#"$target"/}
"
	done
done

if [ -n "$blocked" ] && [ "$force" -eq 0 ]; then
	printf '%s\n%s%s\n' \
		"install.sh: install.sh did not install these folders, and skills-lock.json does not list them from andabove/skills. Nothing was installed." \
		"$blocked" \
		"Move them aside, or run again with --force to replace them." >&2
	exit 1
fi

mkdir -p "$agents"

for skill in "$@"; do
	src=$(CDPATH= cd -P -- "$repo_root/.agents/skills/$skill" && pwd)
	rm -rf "$agents/$skill"
	cp -R "$src" "$agents/$skill"
	echo "Installed by andabove/skills scripts/install.sh, which replaces this folder on its next run." >"$agents/$skill/$marker"
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
