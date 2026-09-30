# AGENTS

Authoring and adaptation rules for this repo. The authoring standard is the `writing-for-agents` skill in `skills/writing-for-agents/`; follow it for every document here.

## Layout

- Every skill is `skills/<name>/SKILL.md`, with disclosed reference in `skills/<name>/references/` and helper scripts in `skills/<name>/scripts/`.
- A reference two skills share is copied into each skill under the same file name, so each installs on its own. The validator fails when the copies differ; edit one and copy it to the rest.
- Frontmatter carries `name` and `description`. Every skill here is model-invoked, so the description is an always-loaded context pointer and must list the distinct trigger branches.
- No skill sets `disable-model-invocation`. These skills install into other repositories, and an installed user-invoked skill is invisible to the agent: when the human types its name in a runtime that does not expand the name before the agent sees it, the agent reports the skill as missing. Strip the flag from any upstream skill that ships with it, give it a pointer description, and record both changes in `adapted`.
- Keep generic skills free of consuming-repository paths and &above brand rules. Put repository rules in that repository's instructions. Put reusable brand rules in an explicit branded skill and add its name to the validator's branded-skill list.

## Adapted skills

- Keep the upstream skill name, except stripping list prefixes like `principle-`.
- Give every skill a `provenance/<name>.json` file. For an original skill, record `source`, `skillPath`, `origin`, and `license`. For an adapted skill, use:

```json
{
	"source": "andabove/skills",
	"skillPath": "skills/<name>/SKILL.md",
	"upstream": {
		"repo": "<owner>/<repo>",
		"path": "<path within repo>",
		"ref": "<pinned commit sha>",
		"license": "MIT"
	},
	"adapted": ["<one line per change from upstream>"]
}
```

- Make the smallest diff against upstream: keep upstream wording where no adaptation is needed, and record every change in the `adapted` list.
- Upstream licence texts live verbatim in `THIRD_PARTY_NOTICES.md`; add the licence of any new upstream before vendoring from it.
- Adapted skills are edited here and reinstalled into consuming repos, never patched in place.
- Run `node scripts/validate.mjs` after each skill or provenance change. The check must pass before installation or commit.

## Copy

- The brand is written &above, never "AndAbove".
- No emojis.
- No em dashes; separate clauses with " - " (space, hyphen, space).
