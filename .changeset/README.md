# Changesets

Run `pnpm changeset` after any user-facing change. Pick affected packages, choose semver bump, write a one-line summary that ends up in the changelog.

`pnpm version-packages` consumes pending changesets and bumps versions. `pnpm release` runs the build and publishes to npm.
