# Changelog

All notable changes to the Soroban contracts in this repository are documented
here. This file follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format and the contracts follow [Semantic Versioning](https://semver.org/).

Contract releases are versioned independently of the backend and frontend. The
version below refers to the contract crate version (`contracts/Cargo.toml`).

## [Unreleased]

### Added

- Nothing yet.

### Changed

- Nothing yet.

### Deprecated

- Nothing yet.

### Removed

- Nothing yet.

### Fixed

- Nothing yet.

### Security

- Nothing yet.

## Compatibility policy

### What counts as breaking

A change is **breaking** if it can cause an existing backend, frontend, indexer
or on-chain consumer to fail or misbehave without being updated. In particular:

- **Entrypoints / signatures** — renaming, removing or reordering a public
  function; changing parameter types, return types or the number of arguments;
  changing the authorization requirements of an entrypoint.
- **Events** — renaming or removing an event, changing its topic layout, or
  changing the shape/order of its data payload. Event topics are part of the
  public ABI.
- **Errors** — removing or renumbering an error variant, or changing the
  meaning of an existing error code.
- **Storage layout** — changing the key used for a persistent/instance entry,
  changing the type stored under a key, or removing a key that existing data
  relies on. Storage migrations must be documented.
- **Contract ID / WASM hash** — deploying a new WASM under a different contract
  ID is a breaking change for consumers that pin the old ID.

Non-breaking (additive) changes include adding a new entrypoint, adding a new
event, adding a new error variant at the end of the enum, and adding a new
storage key that is not read by existing flows.

### How a breaking change is announced

1. **Version bump** — bump the contract crate version according to SemVer:
   MAJOR for breaking changes, MINOR for additive changes, PATCH for fixes.
2. **Migration notes** — add a `### Migration` subsection under the release in
   this changelog describing what consumers must change, including any storage
   migration steps and the old → new mapping for entrypoints, events and errors.
3. **Event version** — when an event payload changes, bump the event version
   carried in the event (or add a new versioned event) so consumers can detect
   and handle both shapes during the transition.

### How consumers are notified

- The release entry in this changelog is the source of truth and is linked from
  the release notes on GitHub.
- Breaking releases are tagged `contracts-vX.Y.Z` and called out in the release
  notes with a **BREAKING** heading.
- Backend and frontend maintainers are notified in the release PR and are
  expected to update their pinned contract version and ABI before the release
  is deployed.

## [0.1.0] - 2024-01-01

### Added

- Initial contract release: core entrypoints, events and error enum as
  currently deployed on main.

[Unreleased]: https://github.com/example/repo/compare/contracts-v0.1.0...HEAD
[0.1.0]: https://github.com/example/repo/releases/tag/contracts-v0.1.0
