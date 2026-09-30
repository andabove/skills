# Linear setup

The Linear skills follow a `## Linear` section in the repository's agent instructions,
which are `AGENTS.md` at the repository root, or `CLAUDE.md` when there is no `AGENTS.md`. Run these
steps when that section is missing, then return to the task that sent you here.

The section records what the team has: its team, projects, estimate scale, and labels. The
skills decide how to use them. Earlier tickets show which options exist. Write new tickets
to the skills' rules, however the earlier ones were written.

1. **Ask which project.** List the Linear projects and ask the user which one this
   repository's work is filed under. Propose the project's lead team as the team, and
   confirm it, because a project can span several teams. Done when the user has named a
   project and a team.
2. **Read what the team has.** List the team's labels, and read the project's 50 most
   recent issues for the estimate scale, which the team settings do not expose. Skip
   retired labels. When a label group names repositories, find this repository's label.
   Done when every line of the section below has a value, or "Not used".
3. **Confirm with the user.** Show the drafted section, with anything you could not find
   marked as a question. Done when every question is answered and they approve it.
4. **Write the section** to the instructions file and tell the user to commit it, so every
   teammate and every agent runtime follows the same rules.

## The section

```markdown
## Linear

- Team: [name] ([key]). File every issue here.
- Projects: [project] for [the product or area of this repository it covers].
- Initiatives: [initiative] rolls up [projects].
- Estimates: [the team's scale, for example XS 1, S 2, M 3, L 5, XL 8].
- Type labels: [label] for [the kind of work it marks].
- Repository label: [this repository's label from a repository label group].
```

Statuses stay out of the section because they change. The skills read them fresh each time.

Keep a line and write "Not used" when the team does not have something, so a reader can
tell a deliberate gap from a section that was never set up.
