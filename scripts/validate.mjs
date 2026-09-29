import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDirectory = join(repositoryRoot, "skills");
const provenanceDirectory = join(repositoryRoot, "provenance");
const brandedSkillNames = new Set(["linear-comment", "linear-status-update", "linear-ticket"]);
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

async function validateSkill(name, errors) {
	const skillDirectory = join(skillsDirectory, name);
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
	if (provenance.skillPath !== `skills/${name}/SKILL.md`) errors.push(`${name}: provenance skillPath does not match directory`);

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
	const skillEntries = await readdir(skillsDirectory, { withFileTypes: true });
	const skillNames = skillEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
	const provenanceNames = (await readdir(provenanceDirectory))
		.filter((name) => name.endsWith(".json"))
		.map((name) => name.slice(0, -5))
		.sort();
	const errors = [];

	for (const name of skillNames) await validateSkill(name, errors);
	for (const name of provenanceNames) {
		if (!skillNames.includes(name)) errors.push(`${name}: provenance has no matching skill directory`);
	}

	if (errors.length > 0) {
		for (const error of errors) process.stderr.write(`${error}\n`);
		process.exitCode = 1;
		return;
	}

	process.stdout.write(`validated ${skillNames.length} skills\n`);
}

await main();
