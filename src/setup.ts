import { chmodSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { addPath, setFailed } from "@actions/core";
import { downloadTool, extractTar, extractZip } from "@actions/tool-cache";
import { RequestError } from "@octokit/request-error";
import { Octokit } from "@octokit/rest";
import { type SemVer, coerce, rsort } from "semver";

/**
 * Mago Setup Options
 */
export interface SetupOptions {
	/**
	 * Version of the Mago CLI to download
	 */
	version: string;

	/**
	 * Operating system to download the CLI for
	 */
	platform: "linux" | "darwin" | "win32";

	/**
	 * Architecture to download the CLI for
	 */
	architecture: "x64" | "arm64";

	/**
	 * Octokit instance to use for API calls
	 */
	octokit: Octokit;
}

const defaultOptions: SetupOptions = {
	version: "latest",
	platform: process.platform as "linux" | "darwin" | "win32",
	architecture: process.arch as "x64" | "arm64",
	octokit: new Octokit(),
};

export const setup = async (config: Partial<SetupOptions>) => {
	const options: SetupOptions = { ...defaultOptions, ...config };

	try {
		const cliPath = await download(options);
		await install(cliPath, options);
	} catch (error: unknown) {
		if (error instanceof Error) {
			console.log(error.message);
			setFailed(error.message);
		}
	}
};

/**
 * Downloads the Mago CLI
 */
const download = async (options: SetupOptions): Promise<string> => {
	try {
		const release = await findRelease(options);
		const assetURL = await findAsset(release.id, options, release.version);
		return await downloadTool(assetURL);
	} catch (error) {
		if (error instanceof RequestError) {
			const requestError = error as RequestError;
			if (
				requestError.status === 403 &&
				requestError.response?.headers["x-ratelimit-remaining"] === "0"
			) {
				throw new Error(`
                    You have exceeded the GitHub API rate limit.
                    Please try again in ${requestError.response?.headers["x-ratelimit-reset"]} seconds.
                    If you have not already done so, you can try authenticating calls to the GitHub API
                    by setting the \`GITHUB_TOKEN\` environment variable.
                `);
			}
		}
		throw error;
	}
};

/**
 * Finds the release for the given version
 */
const findRelease = async (
	options: SetupOptions,
): Promise<{ id: number; version: string }> => {
	let versionToDownload = options.version;

	try {
		if (options.version === "latest") {
			const releases = await options.octokit.paginate(
				"GET /repos/{owner}/{repo}/releases",
				{
					owner: "carthage-software",
					repo: "mago",
				},
			);

			const versions = releases
				.filter((release) => {
					return !release.draft && !release.prerelease;
				})
				.map((release) => {
					return coerce(release.tag_name);
				});

			const sortedVersions = rsort(versions as SemVer[]);

			versionToDownload = sortedVersions[0].version;
		}

		const releaseId = (
			await options.octokit.repos.getReleaseByTag({
				owner: "carthage-software",
				repo: "mago",
				tag: `${versionToDownload}`,
			})
		).data.id;

		if (!releaseId) {
			throw new Error(
				`Version ${options.version} of the Mago CLI does not exist.`,
			);
		}

		return {
			id: releaseId,
			version: versionToDownload,
		};
	} catch (error) {
		if (error instanceof RequestError) {
			const requestError = error as RequestError;
			if (requestError.status === 404) {
				throw new Error(
					`Version ${options.version} of the Mago CLI does not exist.`,
				);
			}
			throw error;
		}
		throw error;
	}
};

/**
 * Finds the asset for the given release ID and options
 */
const findAsset = async (
	releaseId: number,
	options: SetupOptions,
	version: string,
) => {
	const assets = await options.octokit.paginate(
		"GET /repos/{owner}/{repo}/releases/{release_id}/assets",
		{
			owner: "carthage-software",
			repo: "mago",
			release_id: releaseId,
		},
	);

	const architecture = options.architecture === "x64" ? "x86_64" : "aarch64";

	const patterns: Map<string, string> = new Map([
		["linux", `mago-${version}-${architecture}-unknown-linux-musl.tar.gz`],
		["darwin", `mago-${version}-${architecture}-apple-darwin.tar.gz`],
		["win32", `mago-${version}-${architecture}-pc-windows-msvc.zip`],
	]);

	const asset = assets.find((asset) =>
		asset.name.endsWith(
			patterns.get(options.platform) as SetupOptions["platform"],
		),
	);

	if (!asset) {
		throw new Error(
			`Could not find an Mago CLI release for ${options.platform} (${options.architecture}) for the given version (${options.version}).`,
		);
	}

	return asset.browser_download_url;
};

/**
 * Installs the downloaded Mago CLI
 */
const install = async (archivePath: string, options: SetupOptions) => {
	const pathToCLI =
		options.platform === "win32"
			? await extractZip(archivePath)
			: await extractTar(archivePath);

	const binaryName = options.platform === "win32" ? "mago.exe" : "mago";

	const dir = readdirSync(pathToCLI)[0];
	console.log(join(pathToCLI, dir, binaryName));
	console.log("dir", readdirSync(join(pathToCLI, dir)));

	chmodSync(join(pathToCLI, dir, binaryName), "755");

	addPath(join(pathToCLI, dir));
};
