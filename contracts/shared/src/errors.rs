//! ============================================================
//! BOXMEOUT — Contract Error Types
//! Every contract function returns Result<T, ContractError>.
//! No unwrap() allowed in contract code.
//! ============================================================

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum ContractError {
    // ── Authorization ──────────────────────────────────────
    /// Caller is not the contract admin
    Unauthorized = 1,
    /// Caller is not a whitelisted oracle
    OracleNotWhitelisted = 2,
    /// Caller is not the factory contract
    NotFactory = 3,

    // ── Market State ───────────────────────────────────────
    /// Requested market ID does not exist
    MarketNotFound = 10,
    /// Market is not in the expected status for this operation
    InvalidMarketStatus = 11,
    /// Betting window has closed (too close to fight start)
    BettingClosed = 12,
    /// Market has already been initialized
    AlreadyInitialized = 13,

    // ── Bet Validation ─────────────────────────────────────
    /// Bet amount is below config.min_bet
    BetTooSmall = 20,
    /// Bet amount exceeds config.max_bet
    BetTooLarge = 21,
    /// Bettor has already claimed winnings for this market
    AlreadyClaimed = 22,
    /// Bettor placed no bets in this market
    NoBetsFound = 23,

    // ── Oracle / Resolution ────────────────────────────────
    /// Oracle signature verification failed
    InvalidOracleSignature = 30,
    /// Resolution attempted outside of resolution_window
    ResolutionWindowExpired = 31,
    /// A conflicting oracle report already exists
    ConflictingOracleReport = 32,

    // ── Treasury ───────────────────────────────────────────
    /// Caller is not an approved market contract
    MarketNotApproved = 40,
    /// Withdrawal would exceed daily limit
    DailyWithdrawalLimitExceeded = 41,
    /// Insufficient treasury balance for withdrawal
    InsufficientBalance = 42,

    // ── Factory ────────────────────────────────────────────
    /// Factory is paused; market creation is disabled
    FactoryPaused = 50,
    /// Oracle address already in whitelist
    OracleAlreadyWhitelisted = 51,
    /// Vec of market IDs exceeds the maximum allowed (20)
    TooManyMarkets = 52,
}
