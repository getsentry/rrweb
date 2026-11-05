# Contributing to rrweb

We want to make contributing to this project as easy and transparent as
possible.

## Our Development Process

The majority of development on rrweb will occur through GitHub. Accordingly,
the process for contributing will follow standard GitHub protocol.

## Pull Requests

We actively welcome your pull requests (PRs)!

1. Fork the repo and create your branch from `master`.
2. If you've added code that should be tested, add tests
3. Ensure the test suite passes or ask for help as to why tests are failing
4. Don't add a changeset. The changelog is generated from PR titles at release time, so give your PR a descriptive title.
5. If you've changed APIs, update the documentation.
6. Make sure your code lints and typechecks.

## Issues

We use GitHub issues to track public bugs. Please ensure your description is
clear and has sufficient instructions to be able to reproduce the issue.

## Run locally

- Install [pnpm](https://pnpm.io/installation) 12 or newer. pnpm switches to the version pinned in `packageManager`, and its `node` shim runs the version in `devEngines.runtime` (set it up once with `pnpm runtime set node 22 -g`).
- Install dependencies: `pnpm install`
- Build all packages: (in `/`) `pnpm build:all` or `pnpm dev`
- Run recorder on a website: (in `/packages/rrweb`) `pnpm repl`
- Run a cobrowsing/mirroring session locally: (in `/packages/rrweb`) `pnpm live-stream`
- Build individual packages: `pnpm build` or `pnpm dev`
- Test: `pnpm test` or `pnpm test:watch`
- Lint: `pnpm lint`
- Rewrite files with prettier: `pnpm format` or `pnpm format:head`

## Coding style

See [documentation](docs/development/coding-style.md)

## License

rrweb is [MIT licensed](https://github.com/rrweb-io/rrweb/blob/master/LICENSE).

By contributing to rrweb, you agree that your contributions will be licensed
under its MIT license.
