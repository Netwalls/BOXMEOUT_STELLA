use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum PredictionMarketError {
    // ── Initialisation ──────────────────────────────────────────────────────
    AlreadyInitialized = 1,
    NotInitialized = 2,

    // ── Authorisation & roles ────────────────────────────────────────────────
    /// Caller is not the superadmin
    Unauthorized = 10,
    /// Caller is not the oracle for this market
    NotOracle = 11,
    /// Caller is not a whitelisted operator
    NotOperator = 12,
    /// Caller is not the market creator
    NotCreator = 13,
    /// Caller is not the position owner
    NotPositionOwner = 14,

    // ── Global state ─────────────────────────────────────────────────────────
    /// Contract is in emergency pause; all mutations blocked
    EmergencyPaused = 20,

    // ── Market lifecycle ─────────────────────────────────────────────────────
    MarketNotFound = 30,
    /// Expected Open but market is in a different status
    MarketNotOpen = 31,
    /// Betting close time has already passed
    BettingClosed = 32,
    /// Resolution deadline has not yet been reached
    DeadlineNotReached = 33,
    /// Resolution deadline has already passed (e.g. can't reopen)
    DeadlinePassed = 34,
    MarketNotResolvable = 35,
    AlreadyResolved = 36,
    AlreadyCancelled = 37,
    /// Market is not in Reported status (required for dispute/finalize)
    MarketNotReported = 38,
    /// Market is still in its dispute window; cannot finalise yet
    DisputeWindowActive = 39,
    /// Market is in an unexpected status for the requested operation
    InvalidMarketStatus = 103,
    /// Market status is invalid for this operation
    InvalidMarketStatus = 40,

    // ── Outcomes ─────────────────────────────────────────────────────────────
    InvalidOutcome = 50,
    TooFewOutcomes = 51,
    TooManyOutcomes = 52,
    DuplicateOutcomeLabel = 53,

    // ── AMM / Trading ────────────────────────────────────────────────────────
    /// Collateral amount is below Config.min_trade
    TradeTooSmall = 60,
    /// AMM pool has not been seeded with initial liquidity
    PoolNotInitialized = 61,
    /// Slippage guard: actual output is below caller's min_amount_out
    SlippageExceeded = 62,
    /// Reserve would drop to zero; trade size is too large for the pool
    InsufficientReserve = 63,
    /// Price impact exceeds the market's allowed circuit-breaker threshold
    CircuitBreakerTripped = 64,

    // ── Positions ────────────────────────────────────────────────────────────
    PositionNotFound = 70,
    /// User has fewer shares than requested for sell/merge
    InsufficientShares = 71,
    /// Position has already been redeemed
    AlreadyRedeemed = 72,
    /// Outcome is not the winning outcome; cannot redeem
    NotWinningOutcome = 73,

    // ── Liquidity ────────────────────────────────────────────────────────────
    LpPositionNotFound = 80,
    ZeroLiquidity = 81,
    InsufficientLpShares = 82,
    /// LP fees for this position have already been collected
    LpFeesAlreadyClaimed = 83,
    /// Initial liquidity must meet Config.min_liquidity
    BelowMinLiquidity = 84,

    // ── Oracle / Dispute ─────────────────────────────────────────────────────
    /// A dispute already exists for this market
    DisputeAlreadyExists = 90,
    DisputeNotFound = 91,
    /// Dispute window has already expired; cannot dispute
    DisputeWindowExpired = 92,
    /// Dispute bond payment failed or is insufficient
    InsufficientBond = 93,
    /// Dispute has already been resolved
    DisputeAlreadyResolved = 94,

    // ── Fees ─────────────────────────────────────────────────────────────────
    /// fee_bps values sum to more than 10 000 (100 %)
    FeesTooHigh = 100,
    /// Nothing to collect; fee pool is zero
    NoFeesToCollect = 101,

    // ── Metadata ─────────────────────────────────────────────────────────────
    MetadataTooLong = 105,

    // ── General ──────────────────────────────────────────────────────────────
    ArithmeticError = 110,
    TransferFailed = 111,
    InvalidTimestamp = 112,
}
