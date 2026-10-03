import { lstat, readdir, readFile, readlink, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDirectory = join(repositoryRoot, "skills");
const provenanceDirectory = join(repositoryRoot, "provenance");
const runtimeSkillsDirectory = join(repositoryRoot, ".agents", "skills");
const brandedSkillNames = new Set();
const genericSkillForbiddenMarkers = [
	["&above brand reference", /&above|\bandabove\b/i],
	["web repository path", /\b(?:apps\/marketing|content\/andabove|docs\/seo|packages\/(?:content-schema|glass|particles))(?:\/|\b)/i],
	["web repository command", /\bpnpm\s+--filter\s+marketing\b/i],
];

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

async function pathExists(path) {
	try {
		await stat(path);
		return true;
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
}

async function markdownFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await markdownFiles(path)));
		if (entry.isFile() && extname(entry.name) === ".md") files.push(path);
	}

	return files;
}

function frontmatter(text) {
	const match = text.match(/^---\n([\s\S]*?)\n---/);
	return match?.[1] ?? "";
}

function field(source, name) {
	return source.match(new RegExp(`^${name}:\\s*["']?([^\\n"']+)`, "m"))?.[1]?.trim();
}

function localLinks(text) {
	const prose = text.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");
	return [...prose.matchAll(/\[[^\]]*\]\(([^)#]+)(?:#[^)]+)?\)/g)]
		.map((match) => match[1])
		.filter((target) => !/^(?:https?:|mailto:|skill:)/.test(target))
		.filter((target) => target.startsWith(".") || target.includes("/") || extname(target));
}

// A skill is skills/<name>/ or, inside a group folder that has no SKILL.md,
// skills/<group>/<name>/. Installers find both; runtimes read one level, so
// .agents/skills/ holds one symlink per skill.
async function discoverSkills(errors) {
	const skills = [];
	for (const entry of await readdir(skillsDirectory, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const directory = join(skillsDirectory, entry.name);
		if (await pathExists(join(directory, "SKILL.md"))) {
			skills.push({ name: entry.name, directory });
			continue;
		}
		for (const child of await readdir(directory, { withFileTypes: true })) {
			const childDirectory = join(directory, child.name);
			if (child.isDirectory() && (await pathExists(join(childDirectory, "SKILL.md")))) {
				skills.push({ name: child.name, directory: childDirectory });
			} else {
				errors.push(`${relative(repositoryRoot, childDirectory)}: a group folder holds only skill folders`);
			}
		}
	}
	const seen = new Map();
	for (const skill of skills) {
		const first = seen.get(skill.name);
		if (first) errors.push(`${skill.name}: skill name used twice, in ${relative(repositoryRoot, first)} and ${relative(repositoryRoot, skill.directory)}`);
		else seen.set(skill.name, skill.directory);
	}
	return skills.sort((a, b) => a.name.localeCompare(b.name));
}

async function validateRuntimeLinks(skills, errors) {
	const fix = "run node scripts/link-skills.mjs";
	const entries = await readdir(runtimeSkillsDirectory).catch(() => []);
	for (const skill of skills) {
		const link = join(runtimeSkillsDirectory, skill.name);
		const expected = relative(runtimeSkillsDirectory, skill.directory);
		const info = await lstat(link).catch(() => undefined);
		if (!info?.isSymbolicLink() || (await readlink(link)) !== expected) {
			errors.push(`.agents/skills/${skill.name}: must be a symlink to ${expected}; ${fix}`);
		}
	}
	for (const name of entries) {
		if (!skills.some((skill) => skill.name === name)) errors.push(`.agents/skills/${name}: no skill has this name; ${fix}`);
	}
	for (const runtime of [".claude", ".cursor"]) {
		const link = join(repositoryRoot, runtime, "skills");
		const info = await lstat(link).catch(() => undefined);
		if (!info?.isSymbolicLink() || (await readlink(link)) !== "../.agents/skills") errors.push(`${runtime}/skills: must be a symlink to ../.agents/skills; ${fix}`);
	}
}

async function validateSkill({ name, directory: skillDirectory }, errors) {
	const skillPath = join(skillDirectory, "SKILL.md");
	const provenancePath = join(provenanceDirectory, `${name}.json`);

	if (!(await pathExists(skillPath))) {
		errors.push(`${name}: missing SKILL.md`);
		return;
	}

	if (!(await pathExists(provenancePath))) {
		errors.push(`${name}: missing provenance/${name}.json`);
		return;
	}

	const [skillText, provenance] = await Promise.all([
		readFile(skillPath, "utf8"),
		readJson(provenancePath),
	]);
	const metadata = frontmatter(skillText);

	if (field(metadata, "name") !== name) errors.push(`${name}: frontmatter name does not match directory`);
	if (!field(metadata, "description")) errors.push(`${name}: missing frontmatter description`);
	if (/^disable-model-invocation:/m.test(metadata)) errors.push(`${name}: skills must stay model-invoked; remove disable-model-invocation`);
	if (provenance.source !== "andabove/skills") errors.push(`${name}: provenance source must be andabove/skills`);
	if (provenance.skillPath !== relative(repositoryRoot, skillPath)) errors.push(`${name}: provenance skillPath does not match directory`);

	const agentManifest = join(skillDirectory, "agents", "openai.yaml");
	if (await pathExists(agentManifest)) {
		const manifest = await readFile(agentManifest, "utf8");
		if (/allow_implicit_invocation:\s*false/.test(manifest)) {
			errors.push(`${name}: skills must stay model-invoked; remove allow_implicit_invocation: false from agents/openai.yaml`);
		}
	}

	for (const markdownPath of await markdownFiles(skillDirectory)) {
		const text = await readFile(markdownPath, "utf8");
		if (!brandedSkillNames.has(name)) {
			for (const [label, pattern] of genericSkillForbiddenMarkers) {
				if (pattern.test(text)) {
					errors.push(`${relative(repositoryRoot, markdownPath)}: generic skill contains ${label}`);
				}
			}
		}
		for (const target of localLinks(text)) {
			if (!(await pathExists(resolve(dirname(markdownPath), target)))) {
				errors.push(`${relative(repositoryRoot, markdownPath)}: unresolved link ${target}`);
			}
		}
	}
}

async function main() {
	const errors = [];
	const skills = await discoverSkills(errors);
	const skillNames = skills.map((skill) => skill.name);
	const provenanceNames = (await readdir(provenanceDirectory))
		.filter((name) => name.endsWith(".json"))
		.map((name) => name.slice(0, -5))
		.sort();

	for (const skill of skills) await validateSkill(skill, errors);
	await validateRuntimeLinks(skills, errors);
	for (const name of provenanceNames) {
		if (!skillNames.includes(name)) errors.push(`${name}: provenance has no matching skill directory`);
	}

	const referenceCopies = new Map();
	for (const { name, directory } of skills) {
		const referencesDirectory = join(directory, "references");
		if (!(await pathExists(referencesDirectory))) continue;
		for (const file of await readdir(referencesDirectory)) {
			const text = await readFile(join(referencesDirectory, file), "utf8");
			const first = referenceCopies.get(file);
			if (!first) referenceCopies.set(file, { name, text });
			else if (first.text !== text) {
				errors.push(`${name}: references/${file} differs from the copy in ${first.name}; shared references must stay identical`);
			}
		}
	}

	if (errors.length > 0) {
		for (const error of errors) process.stderr.write(`${error}\n`);
		process.exitCode = 1;
		return;
	}

	process.stdout.write(`validated ${skillNames.length} skills\n`);
}

await main();
