import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { info, warning } from "@actions/core";
import type { Octokit } from "@octokit/rest";
import {
	type SemVer,
	coerce,
	maxSatisfying,
	rsort,
	valid,
	validRange,
} from "semver";
import { getInput } from "./helpers";

/**
 * Determines the version of the Mago CLI to setup.
 *
 * This function will first check the `version` input. If the input is set
 * to a valid version, that version will be used. If the input is set to
 * `latest`, the latest release of the Mago CLI will be used. If the input
 * is not set, the version of the Mago CLI installed in the project's dependencies
 * will be used. As a fallback, the latest release of the Mago CLI will be used.
 *
 * @param projectRoot The root directory of the project. Defaults to the current working directory.
 */
export const getMagoVersion = async (octokit: Octokit): Promise<string> => {
	let root = getInput("working-directory");

	// If the working directory is not specified, we fallback to the current
	// working directory.
	if (!root) {
		root = process.cwd();
		info(
			"No working directory specified. Using the current working directory.",
		);
	}

	// If the working directory has been specified, but does not exist,
	// we fallback to the current working directory.
	if (root && !existsSync(join(root))) {
		root = process.cwd();
		warning(
			"The specified working directory does not exist. Using the current working directory instead.",
		);
	}

	return (
		getInput("version") ??
		(await extractVersionFromComposerLockFile(root)) ??
		(await extractVersionFromComposerJson(root, octokit)) ??
		"latest"
	);
};

/**
 * Extracts the Mago CLI version from the project's composer.lock file.
 *
 * If the lock file does not exist, or mago is not installed in the project,
 * this function will return undefined.
 */
const extractVersionFromComposerLockFile = async (root: string) => {
	try {
		const lockfile = JSON.parse(
			await readFile(join(root, "composer.lock"), "utf-8"),
		);
		return lockfile["packages-dev"].find(
			(pkg: Record<string, unknown>) => pkg.name === "carthage-software/mago",
		)?.version;
	} catch {
		return undefined;
	}
};

/**
 * Extracts the Mago CLI version from the project's composer.json file.
 *
 * This function attempts to extract the version of the `carthage-software/mago`
 * package from the `composer.json` file. If the package is not installed,
 * or the version cannot be extracted, this function will return undefined.
 *
 * If the version is specified as a range, this function will return the
 * highest available version that satisfies the range, if it exists, or
 * undefined otherwise.
 */
const extractVersionFromComposerJson = async (
	root: string,
	octokit: Octokit,
): Promise<string | undefined> => {
	try {
		const manifest = JSON.parse(
			await readFile(join(root, "composer.json"), "utf8"),
		);

		// The package should be installed as dev dependency, but we'll check
		// both "require" and "require-dev" just in case.
		const versionSpecifier =
			manifest["require-dev"]?.["carthage-software/mago"] ??
			manifest.require?.["carthage-software/mago"];

		// MAgo is not a dependency of the project.
		if (!versionSpecifier) {
			return undefined;
		}

		// If the version is specific, we return it directly.
		if (valid(versionSpecifier)) {
			return versionSpecifier;
		}

		// If the version is a range, return the highest available version.
		if (validRange(versionSpecifier)) {
			warning(
				`The version of mago detected in your composer.json file is specified as a range. 
				We'll install the latest version that satisfies the range. You can pin the version 
				to a specific release to avoid this warning.`,
				{ title: "Mago version specified as a range." },
			);

			const versions = await fetchMagoVersions(octokit);

			if (!versions) {
				return undefined;
			}

			return maxSatisfying(versions, versionSpecifier)?.version ?? undefined;
		}
	} catch {
		return undefined;
	}
};

/**
 * Fetches the available versions of the Mago CLI from GitHub.
 *
 * This function will return the versions of the Mago CLI that are available
 * on GitHub. This includes all versions that have been released, including
 * pre-releases and draft releases.
 */
const fetchMagoVersions = async (
	octokit: Octokit,
): Promise<SemVer[] | undefined> => {
	try {
		const releases = await octokit.paginate(
			"GET /repos/{owner}/{repo}/releases",
			{
				owner: "carthage-software",
				repo: "mago",
			},
		);

		const versions = releases
			.filter((release) => !release.draft && !release.prerelease)
			.map((release) => coerce(release.tag_name));

		return rsort(versions as SemVer[]);
	} catch {
		return undefined;
	}
};
