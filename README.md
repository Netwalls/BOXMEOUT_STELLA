# MarketPlace

A decentralized prediction market platform.

## Frontend

### Visual Regression Tests

Core components (`MarketCard`, `BettingInterface`, `FighterCard`) are covered by
Storybook visual regression tests. Snapshots are captured in both **light** and
**dark** themes so theme-specific UI regressions are caught before merge.

#### Setup

Visual regression testing uses the [Storybook test-runner](https://github.com/storybookjs/test-runner)
with the Playwright image-snapshot integration. Stories live in `frontend/stories/`.

```bash
cd frontend
npm install
npx playwright install --with-deps chromium
```

#### Running the tests

```bash
# Run all visual regression tests (light + dark)
npm run test-storybook

# Run against a running Storybook instance
npm run storybook        # in one terminal
npm run test-storybook   # in another
```

Each core component has a `Light` and `Dark` story. The test-runner renders every
story and compares the screenshot against the committed baseline in
`frontend/stories/__snapshots__/`.

#### Updating snapshots

When a UI change is intentional, regenerate the baselines and commit them with
the change:

```bash
cd frontend
npm run test-storybook -- --updateSnapshot
```

Review the diff of `frontend/stories/__snapshots__/` before committing — every
changed image should be an expected result of the code change. Never update
snapshots to make a failing test pass without confirming the new rendering is
correct.

#### CI

Visual regression tests run in the frontend CI workflow. A failing snapshot
comparison fails the build and uploads the diff artifacts for review.
