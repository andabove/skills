// Type checks every TypeScript example in the Effect skills against the
// versions pinned in scripts/effect-examples/package.json.
//
// Each ```ts or ```typescript block in skills/effect*/**/*.md becomes one
// module. A block whose info string holds `nocheck` is skipped: use it only
// for a fragment that cannot compile alone, such as a diff or a signature.
// Run: node scripts/check-effect-examples.mjs
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const toolDirectory = join(root, "scripts", "effect-examples");
const outDirectory = join(toolDirectory, ".examples");
const fence = /^```(ts|typescript)([^\n]*)\n([\s\S]*?)^```/gm;

async function markdownFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await markdownFiles(path)));
		else if (entry.name.endsWith(".md")) files.push(path);
	}
	return files;
}

async function examples() {
	const found = [];
	const skills = (await readdir(join(root, "skills"), { withFileTypes: true }))
		.filter((entry) => entry.isDirectory() && entry.name.startsWith("effect"))
		.map((entry) => join(root, "skills", entry.name));
	for (const skill of skills) {
		for (const file of await markdownFiles(skill)) {
			const text = await readFile(file, "utf8");
			for (const match of text.matchAll(fence)) {
				if (/\bnocheck\b/.test(match[2])) continue;
				const line = text.slice(0, match.index).split("\n").length + 1;
				found.push({ file: relative(root, file), line, code: match[3] });
			}
		}
	}
	return found;
}

async function main() {
	if (!existsSync(join(toolDirectory, "node_modules"))) {
		execFileSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: toolDirectory, stdio: "inherit" });
	}
	await rm(outDirectory, { recursive: true, force: true });
	const blocks = await examples();
	if (blocks.length === 0) {
		process.stdout.write("type checked 0 Effect example(s)\n");
		return;
	}
	const sources = new Map();
	for (const [index, block] of blocks.entries()) {
		const name = `${String(index).padStart(4, "0")}.ts`;
		const path = join(outDirectory, name);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, `${block.code}\nexport {}\n`);
		sources.set(name, block);
	}
	let output = "";
	try {
		execFileSync(join(toolDirectory, "node_modules", ".bin", "tsc"), ["-p", join(toolDirectory, "tsconfig.json"), "--pretty", "false"], { encoding: "utf8" });
	} catch (error) {
		output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
	}
	const failures = output
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const match = /\.examples\/(\d{4}\.ts)\((\d+),(\d+)\): (.*)$/.exec(line);
			if (!match) return line;
			const block = sources.get(match[1]);
			return `${block.file}:${block.line + Number(match[2]) - 1}: ${match[4]}`;
		});
	if (failures.length > 0) {
		for (const failure of failures) process.stderr.write(`${failure}\n`);
		process.stderr.write(`${failures.length} type error(s) in ${blocks.length} Effect example(s)\n`);
		process.exitCode = 1;
		return;
	}
	process.stdout.write(`type checked ${blocks.length} Effect example(s)\n`);
}

await main();
