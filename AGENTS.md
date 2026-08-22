# AGENTS

Authoring and adaptation rules for this repo. The authoring standard is the `writing-for-agents` skill in `skills/writing-for-agents/`; follow it for every document here.

## Layout

- Every skill is `skills/<name>/SKILL.md`, with disclosed reference in `skills/<name>/references/` and helper scripts in `skills/<name>/scripts/`.
- Frontmatter carries `name` and `description`. The description is the skill's always-loaded context pointer: it must list the trigger branches (the distinct cases that should fire it), not just restate the title.
- Keep upstream `disable-model-invocation` frontmatter as shipped unless there is a recorded reason to change it.

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

## Copy

- The brand is written &above, never "AndAbove".
- No emojis.
- No em dashes; separate clauses with " - " (space, hyphen, space).
