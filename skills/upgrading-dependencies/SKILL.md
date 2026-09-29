---
name: upgrading-dependencies
description: Upgrade a dependency, or learn how it behaves at the installed version. Use when you bump a dependency or review an automated update such as a Dependabot pull request, or when a bug or an API question needs the library's own source.
---

# Upgrading dependencies

## Read the local facts first

The repository's tooling doc supplies what this skill leaves open. Find it from `AGENTS.md` or `CLAUDE.md`. It can name:

- where the versions are pinned, such as a workspace catalog,
- a minimum release age, and how to take a fix sooner,
- the packages that must move together,
- the packages that get a commit of their own, such as a formatter that rewrites many files,
- the versions that are held back, and why.

Where the tooling doc and this skill disagree, the tooling doc wins.

## Read the source at the installed version

Use this for an upgrade, a bug or an API question.

1. Read the installed version from the lockfile or from `node_modules/<name>/package.json`. The range in `package.json` does not say which version is installed.
2. Clone the dependency's repository into a scratch folder that git ignores, and check out the tag of that version.
3. Read the source, the docs and the migration notes there. The build in `node_modules/` is often minified, and the docs online describe the latest version.

## Upgrade a dependency

1. **Read the release notes and the migration guide** for every version between the old one and the new one. Done when you can list each breaking change and say whether this repository uses what it changes.
2. **Check the peer ranges.** Each installed package that has this one as a peer must accept the new version. Read the `peerDependencies` of each one in `node_modules/`.
3. **Bump the version** where the repository pins it. Move the packages that must move together in one commit.
4. **Fix the code** for each breaking change that applies.
5. **Fix the stale docs.** Search the docs, the agent files and the skills for the package name and the old major version. Change each line that the upgrade makes false, in the same commit. Done when the search finds no false claim.
6. **Run every check**, including the slow suites that the git hooks skip.
7. **Commit** with the `commit-messages` skill. In the body, name each breaking change that applied and what you changed for it.

## Review an automated update

A bot pull request passes CI, but it does not do steps 1, 2 and 5. Do them before you merge. For a new major version, also do step 4, and read the whole migration guide, not only the release summary.
