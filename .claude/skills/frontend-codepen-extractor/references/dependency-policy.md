# Dependency and asset policy

## Dependency classification

Classify every library or external script found in the prototype:

1. **Already present** — package/lockfile contains it and version is compatible.
2. **Required new dependency** — explain what feature requires it and provide the exact command for the existing package manager.
3. **Replaceable** — an existing package or native browser API can provide the behavior with lower cost/risk.
4. **Prototype-only** — unused after conversion and can be removed.
5. **Unknown** — source/version/purpose could not be confirmed; investigate before relying on it.

Never install packages without user approval. Do not modify the lockfile manually. Do not mix npm/pnpm/yarn/bun in one project.

## Compatibility checks

Before recommending a package, verify where feasible:
- existing framework and runtime versions
- package compatibility and peer dependencies
- current package manager/lockfile
- whether the library is already available transitively (do not depend on undeclared transitive packages)
- whether it is needed at runtime or only during development
- bundle, maintenance, licensing, and security implications when material

Give the install command appropriate to the project, for example `npm install <package>` or `npm install -D <package>`, but only after identifying the package manager and dependency type. If that is unknown, explain the assumption.

## CDN and remote resources

For each script, stylesheet, font, image, icon, or model URL, record:
- URL and purpose
- whether its source and version were actually inspected
- whether the prototype relies on a global variable
- whether the target project should use a bundled import or intentionally keep it remote
- origin, license/attribution, CSP, privacy, availability, and integrity caveats where relevant

Do not blindly copy external script tags into a production app. Prefer version-pinned, bundler-managed dependencies when that matches project conventions. Do not add SRI hashes unless the exact content/version can be verified. Do not automatically download assets, scrape protected content, or recreate licensed brand/artwork.

## Fonts, images, and icons

- Prefer repository-owned assets and already installed icon libraries.
- Avoid copying base64 blobs or massive inline data URLs without need.
- Use descriptive asset names and alt text for informative images.
- Check font and asset license/attribution before local redistribution when known.
- Document placeholders when a referenced asset could not be retrieved.

## Reporting format

For every new dependency/resource list: name/URL, purpose, status, command (if needed), reason, and unresolved caveat. Clearly distinguish recommendations from changes actually made.
