# Contributing

## Required CI checks

Every pull request must pass all three checks before it can be merged to `main`:

- `Backend CI / TypeScript Build + Tests`
- `Frontend CI / TypeScript Build + Tests`
- `Contracts CI / Rust Tests + Clippy`

Repository administrators should require these exact status checks in the `main`
branch protection rules. The checks run for every pull request, regardless of
which directories it changes.

## Fork pull request workflow approval

GitHub may hold a workflow run from a fork until a maintainer approves it. A
maintainer should review the pull request, including changes to workflow files,
before approving execution. To release a held run, open the repository's
**Actions** tab, select the waiting workflow run, and choose **Approve and run**.
Do not approve runs from unreviewed code. Workflows execute contributor code on
a runner, so do not add secrets to these CI jobs or treat fork code as trusted.

Contributors should check the **Checks** tab after opening or updating a pull
request. If the checks are waiting for approval, notify a maintainer; the
contributor cannot approve their own run.

## Rebase before opening a pull request

Update your branch from the repository's `main` branch before opening a pull
request, and rebase again if `main` advances while your work is in review:

For a fork-based checkout, add the project repository as `upstream` once if it
is not already configured:

```sh
git remote add upstream https://github.com/Netwalls/BOXMEOUT_STELLA.git
```

Then update your branch:

```sh
git fetch upstream
git switch <your-branch>
git rebase upstream/main
# Resolve any conflicts, then continue the rebase:
git add <resolved-files>
git rebase --continue
git push --force-with-lease
```

Run the tests and checks for the areas you changed before pushing. A pull
request is ready to merge only when all three required CI checks pass.