import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

async function readLock(path) {
	try {
		return await readJson(path);
	} catch (error) {
		if (error.code === "ENOENT") {
			return { version: 2, skills: {} };
		}

		throw error;
	}
}

function createLockEntry(entry) {
	const lockEntry = {
		source: entry.source,
		sourceType: "local",
		skillPath: entry.skillPath,
	};

	if (entry.upstream) {
		lockEntry.upstream = entry.upstream;
	} else {
		lockEntry.origin = entry.origin;
		lockEntry.license = entry.license;
	}

	return lockEntry;
}

async function main() {
	const [lockPath, provenanceDirectory, ...skillNames] = process.argv.slice(2);
	if (!lockPath || !provenanceDirectory || skillNames.length === 0) {
		throw new Error("usage: update-lock.mjs <lock-path> <provenance-directory> <skill...>");
	}

	const lock = await readLock(lockPath);
	const skills = { ...(lock.skills ?? {}) };

	for (const skillName of skillNames) {
		const entry = await readJson(resolve(provenanceDirectory, `${skillName}.json`));

		skills[skillName] = createLockEntry(entry);
	}

	await writeFile(
		lockPath,
		`${JSON.stringify({ version: 2, skills }, null, 2)}\n`,
		"utf8",
	);
}

await main();
