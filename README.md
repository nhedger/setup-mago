# Setup Mago CLI in GitHub Actions

[![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/nhedger/setup-mago?label=latest&logo=github&labelColor=374151&color=60a5fa)](https://github.com/marketplace/actions/setup-mago)
[![Test](https://github.com/nhedger/setup-mago/actions/workflows/test.yaml/badge.svg)](https://github.com/nhedger/setup-mago/actions/workflows/test.yaml)
[![Integrate](https://github.com/nhedger/setup-mago/actions/workflows/integrate.yaml/badge.svg)](https://github.com/nhedger/setup-mago/actions/workflows/integrate.yaml)

**Setup Mago** is a GitHub action that provides a cross-platform interface
for setting up the [Mago CLI](https://mago.carthage.software/#/) in GitHub
Actions runners.

## Inputs

The following inputs are supported.

```yaml
- name: Setup Mago
  uses: nhedger/setup-mago@v1
  with:

    # The version of the Mago CLI to install.
    # This input is optional and by default the version will be automatically
    # detected from the project's dependencies. If no version is found in the
    # project's dependencies, the latest version of the Mago CLI will be installed.
    # Example values: "0.7.0", "latest"
    version: ""

    # The GitHub token to use to authenticate GitHub API requests.
    # This input is optional and defaults to the job's GitHub token.
    # Example value: ${{ secrets.GITHUB_TOKEN }}
    token: ${{ github.token }}

    # The directory in which the composer.lock will be looked for when automatically
    # determining the version of the Mago CLI to install. Defaults to the current
    # working directory.
    working-directory: ""
```

## Examples

### Automatic version detection

To automatically determine the version of Mago to install based on the project's dependencies, omit the `version` input.

The action will look for the version of the `carthage-software/mago` dependency in the composer.lock. If the version cannot 
be found in the lockfile, the action will install the latest version of the Mago CLI.

```yaml
- name: Setup Mago
  uses: nhedger/setup-mago@v1

- name: Run Mago
  run: mago lint
```

### Latest version

Setup the latest version of the Mago CLI.

```yaml
- name: Setup Mago CLI
  uses: nhedger/setup-mago@v1
  with:
    version: latest

- name: Run Mago
  run: mago lint
```

### Specific version

Install version `0.7.0` of the Mago CLI.

```yaml
- name: Setup Mago CLI
  uses: nhedger/setup-mago@v1
  with:
    version: 0.7.0

- name: Run Mago
  run: mago lint
```

## License

Copyright © 2025, Nicolas Hedger. Released under the [MIT License](LICENSE.md).
