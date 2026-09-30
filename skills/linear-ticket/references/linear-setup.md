# Linear setup

The Linear skills follow a `## Linear` section in the repository's agent instructions:
`AGENTS.md` at the repository root, or `CLAUDE.md` when there is no `AGENTS.md`. Run these
steps when that section is missing, then return to the task that sent you here.

1. **Ask which project.** List the Linear projects and ask the user which one this
   repository's work is filed under. Propose the project's lead team as the team, and
   confirm it, because a project can span several teams. Done when the user has named a
   project and a team.
2. **Survey what the team does.** Read the team's labels, then the project's 50 most recent
   issues, then open about ten of them with their relations. Note which estimates,
   priorities, labels, and relations are in real use rather than only configured, and how
   work is split into sub-issues. Take conventions from the issues and the repository, not
   from the project description, which goes stale. Done when every line of the section
   below has a value you observed, or "Not used".
3. **Find the conflicts.** Compare what the team does with the Linear skills' rules: title
   style, ticket shape, sub-issue titles. List each difference.
4. **Suggest defaults.** Draft the section from the survey, choosing the most-used option
   wherever there is a choice. Mark anything you could not infer, and every conflict, as a
   question.
5. **Confirm with the user.** The conventions are theirs to decide, including which rule
   wins in each conflict. Done when every question is answered and they approve the draft.
6. **Write the section** to the instructions file and tell the user to commit it, so every
   teammate and every agent runtime follows the same rules.

## Labels

Skip retired labels. A label group allows one of its labels per issue. When a group names
repositories, record this repository's label so every issue carries it.

## The section

```markdown
## Linear

- Team: [name] ([key]). File every issue here.
- Projects: [project] for [the product or area of this repository it covers].
- Initiatives: [initiative] rolls up [projects].
- Estimates: [the scale in use, for example S 2, M 3, L 5].
- Priority: [when each level is used].
- Labels: [label] for [when to apply it].
- Repository label: [the label from a repository label group that every issue carries].
- Sub-issues: [how work is split, for example one sub-issue per slice under a parent].
- Blocking: [how order between issues is recorded, for example blocks and blocked-by relations].
- House rules: [each team convention that overrides a Linear skill rule, for example "titles start with feat: or fix:"].
```

Statuses, milestones, and cycles stay out of the section: statuses are read fresh each time,
and milestones and cycles are the team's planning, not the agent's.

Keep a line and write "Not used" when the team does not use something, so a reader can tell
a deliberate gap from a section that was never set up.
