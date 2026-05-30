# Changelog

## [Unreleased]

### Added
- `Market::get_bet()` — view function returning a bettor's position (#716)
- `MarketFactory::get_open_market_ids()` — efficient open market filtering (#717)
- `Market::upgrade()` — admin-only WASM upgrade mechanism (#718)
- `create_market()` fee_bps override per market, capped at 1000 bps (#719)
