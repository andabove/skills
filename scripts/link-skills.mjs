// Rebuilds .claude/skills/ as one symlink per skill, so each runtime finds
// every skill one level deep, also the skills inside a group folder.
// .agents/skills and .cursor/skills point to .claude/skills.
// Run: node scripts/link-skills.mjs
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, symlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDirectory = join(root, "skills");
const runtimeDirectory = join(root, ".claude", "skills");

const skills = [];
for (const entry of await readdir(skillsDirectory, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	const directory = join(skillsDirectory, entry.name);
	if (existsSync(join(directory, "SKILL.md"))) {
		skills.push({ name: entry.name, directory });
		continue;
	}
	for (const child of await readdir(directory, { withFileTypes: true })) {
		const childDirectory = join(directory, child.name);
		if (child.isDirectory() && existsSync(join(childDirectory, "SKILL.md"))) skills.push({ name: child.name, directory: childDirectory });
	}
}

await rm(runtimeDirectory, { recursive: true, force: true });
await mkdir(runtimeDirectory, { recursive: true });
for (const skill of skills) await symlink(relative(runtimeDirectory, skill.directory), join(runtimeDirectory, skill.name));

for (const runtime of [".agents", ".cursor"]) {
	const link = join(root, runtime, "skills");
	await rm(link, { recursive: true, force: true });
	await mkdir(dirname(link), { recursive: true });
	await symlink("../.claude/skills", link);
}

process.stdout.write(`linked ${skills.length} skills in .claude/skills\n`);
