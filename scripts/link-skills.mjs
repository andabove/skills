// Rebuilds .agents/skills/ as one symlink per skill, so each runtime finds
// every skill one level deep, also the skills inside a group folder.
// .claude/skills and .cursor/skills point to .agents/skills, the folder that
// `npx skills add` also treats as canonical.
// Run: node scripts/link-skills.mjs
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, symlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDirectory = join(root, "skills");
const runtimeDirectory = join(root, ".agents", "skills");

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

// Check before the old links go, so a failed run leaves them in place.
const names = new Set();
for (const skill of skills) {
	if (names.has(skill.name)) throw new Error(`skill name used twice: ${skill.name}; rename one, then run this again`);
	names.add(skill.name);
}

await rm(runtimeDirectory, { recursive: true, force: true });
await mkdir(runtimeDirectory, { recursive: true });
for (const skill of skills) await symlink(relative(runtimeDirectory, skill.directory), join(runtimeDirectory, skill.name));

for (const runtime of [".claude", ".cursor"]) {
	const link = join(root, runtime, "skills");
	await rm(link, { recursive: true, force: true });
	await mkdir(dirname(link), { recursive: true });
	await symlink("../.agents/skills", link);
}

process.stdout.write(`linked ${skills.length} skills in .agents/skills\n`);
