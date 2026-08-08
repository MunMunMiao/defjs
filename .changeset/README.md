# Changesets

Any pull request that changes published behavior must include a changeset:

```sh
pnpm changeset
```

Select the affected packages, choose the appropriate bump type, and commit the generated `.changeset/*.md` file with the code change.

## Release flow

1. The change pull request includes its changeset and passes the full repository CI.
2. After the change is merged to `main`, CI uses the repository `GITHUB_TOKEN` to create or update the `chore: version packages` pull request.
3. The Version Packages pull request applies version and changelog updates and removes the consumed changesets. GitHub requires a maintainer to approve CI runs triggered by this automated pull request; approve them and merge only after they pass.
4. Fetch `main`, confirm the Version Packages pull request is merged, and create one control tag pointing exactly to the current `origin/main` tip:

   ```sh
   git fetch --no-tags origin main:refs/remotes/origin/main
   git tag release-YYYY-MM-DD.N origin/main
   git push origin release-YYYY-MM-DD.N
   ```

5. The Release workflow validates the tagged commit again, publishes the npm packages, pushes the package version tags, and creates GitHub Releases. Checks and publish run on different runners, so the publish job rebuilds through `pnpm run release` before publishing.

Only `release-*` control tags trigger publishing. Changesets package tags such as `@defjs/core@0.5.0` do not trigger another release run.
