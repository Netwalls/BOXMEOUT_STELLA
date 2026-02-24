# Requirements Document

## Introduction

This document specifies the requirements for a blockchain-database synchronization system that periodically verifies data consistency between the PostgreSQL database and the Stellar blockchain smart contracts. The system detects drift between the two sources of truth, logs discrepancies, and alerts administrators when mismatches are found.

The synchronization service ensures that critical data—including market odds, resolution outcomes, and USDC balances—remain consistent across the database and blockchain, maintaining system integrity and user trust.

## Glossary

- **Sync_Service**: The periodic synchronization service that compares database state with blockchain state
- **Database**: The PostgreSQL database managed by Prisma ORM containing market, user, and transaction data
- **Blockchain**: The Stellar blockchain network running Soroban smart contracts for markets, AMM pools, and treasury
- **Market**: A prediction market with two outcomes (A and B) that users can trade on
- **Open_Market**: A market with status OPEN that is accepting trades
- **Resolved_Market**: A market with status RESOLVED that has a determined winning outcome
- **Pool_State**: The on-chain AMM pool state containing liquidity for outcome A and outcome B
- **Odds**: The probability ratio between outcome A and outcome B derived from pool liquidity
- **Winning_Outcome**: The final result of a resolved market (either outcome A or outcome B)
- **USDC_Balance**: The amount of USDC tokens held by a user or contract
- **Mismatch**: A discrepancy between database state and blockchain state
- **Admin**: A system administrator who receives alerts about data inconsistencies
- **CRON_Job**: A scheduled task that runs at fixed time intervals

## Requirements

### Requirement 1: Periodic Synchronization Execution

**User Story:** As a system administrator, I want the synchronization service to run automatically every 5 minutes, so that data drift is detected quickly without manual intervention.

#### Acceptance Criteria

1. THE Sync_Service SHALL execute every 5 minutes using a CRON_Job
2. WHEN the Sync_Service starts execution, THE Sync_Service SHALL log the start time and sync operation identifier
3. WHEN the Sync_Service completes execution, THE Sync_Service SHALL log the completion time and summary of checks performed
4. IF the Sync_Service fails to complete within 4 minutes, THEN THE Sync_Service SHALL log a timeout warning and terminate gracefully

### Requirement 2: Market Odds Verification

**User Story:** As a system administrator, I want to verify that market odds in the database match the on-chain pool state for open markets, so that users see accurate pricing information.

#### Acceptance Criteria

1. WHEN the Sync_Service executes, THE Sync_Service SHALL retrieve all Open_Market records from the Database
2. FOR each Open_Market, THE Sync_Service SHALL query the Pool_State from the Blockchain using the market contract address
3. FOR each Open_Market, THE Sync_Service SHALL calculate the expected Odds from the Database liquidity values (yesLiquidity and noLiquidity)
4. FOR each Open_Market, THE Sync_Service SHALL calculate the actual Odds from the Blockchain Pool_State
5. IF the calculated Odds differ by more than 0.01 (1%), THEN THE Sync_Service SHALL log a Mismatch with market ID, database odds, and blockchain odds
6. WHEN a Mismatch is detected, THE Sync_Service SHALL include the market title and contract address in the log entry

### Requirement 3: Resolved Market Outcome Verification

**User Story:** As a system administrator, I want to verify that winning outcomes in the database match the on-chain resolution for resolved markets, so that winnings are distributed correctly.

#### Acceptance Criteria

1. WHEN the Sync_Service executes, THE Sync_Service SHALL retrieve all Resolved_Market records from the Database
2. FOR each Resolved_Market, THE Sync_Service SHALL query the Winning_Outcome from the Blockchain using the market contract address
3. FOR each Resolved_Market, THE Sync_Service SHALL compare the Database winningOutcome field with the Blockchain Winning_Outcome
4. IF the winningOutcome values do not match, THEN THE Sync_Service SHALL log a Mismatch with market ID, database outcome, and blockchain outcome
5. WHEN a Mismatch is detected for a Resolved_Market, THE Sync_Service SHALL mark the mismatch as critical priority

### Requirement 4: USDC Balance Reconciliation

**User Story:** As a system administrator, I want to reconcile USDC balances between the database and blockchain, so that user account balances are accurate and withdrawals are safe.

#### Acceptance Criteria

1. WHEN the Sync_Service executes, THE Sync_Service SHALL retrieve all user USDC_Balance values from the Database
2. FOR each user with a wallet address, THE Sync_Service SHALL query the USDC_Balance from the Blockchain using the wallet address
3. FOR each user, THE Sync_Service SHALL compare the Database usdcBalance field with the Blockchain USDC_Balance
4. IF the USDC_Balance values differ by more than 0.000001 USDC (1 stroop), THEN THE Sync_Service SHALL log a Mismatch with user ID, database balance, and blockchain balance
5. WHEN a Mismatch is detected, THE Sync_Service SHALL include the wallet address in the log entry
6. IF a user does not have a wallet address, THEN THE Sync_Service SHALL skip balance verification for that user

### Requirement 5: Mismatch Logging and Alerting

**User Story:** As a system administrator, I want all mismatches to be logged with detailed information and trigger alerts, so that I can investigate and resolve data inconsistencies promptly.

#### Acceptance Criteria

1. WHEN a Mismatch is detected, THE Sync_Service SHALL write a structured log entry with timestamp, mismatch type, resource ID, database value, and blockchain value
2. WHEN a Mismatch is detected, THE Sync_Service SHALL increment a mismatch counter metric for monitoring
3. WHEN a critical Mismatch is detected (resolved market outcome), THE Sync_Service SHALL send an alert notification to the Admin
4. THE Sync_Service SHALL support multiple alert channels including log files, metrics endpoints, and external notification services
5. WHEN the Sync_Service completes, THE Sync_Service SHALL log a summary including total markets checked, total users checked, and total mismatches found

### Requirement 6: Error Handling and Resilience

**User Story:** As a system administrator, I want the synchronization service to handle errors gracefully, so that temporary blockchain or database issues do not cause the service to crash.

#### Acceptance Criteria

1. IF the Database connection fails, THEN THE Sync_Service SHALL log the error and retry the connection up to 3 times with exponential backoff
2. IF the Blockchain RPC connection fails, THEN THE Sync_Service SHALL log the error and retry the connection up to 3 times with exponential backoff
3. IF a single market verification fails, THEN THE Sync_Service SHALL log the error and continue processing remaining markets
4. IF a single user balance verification fails, THEN THE Sync_Service SHALL log the error and continue processing remaining users
5. WHEN the Sync_Service encounters an unrecoverable error, THE Sync_Service SHALL log the error with full context and exit with a non-zero status code
6. THE Sync_Service SHALL implement rate limiting when querying the Blockchain to avoid overwhelming the RPC endpoint

### Requirement 7: Configuration and Deployment

**User Story:** As a system administrator, I want to configure the synchronization service through environment variables, so that I can adjust settings without code changes.

#### Acceptance Criteria

1. THE Sync_Service SHALL read the CRON schedule from an environment variable with a default of "*/5 * * * *" (every 5 minutes)
2. THE Sync_Service SHALL read the odds mismatch threshold from an environment variable with a default of 0.01 (1%)
3. THE Sync_Service SHALL read the balance mismatch threshold from an environment variable with a default of 0.000001 USDC
4. THE Sync_Service SHALL read the Database connection string from the DATABASE_URL environment variable
5. THE Sync_Service SHALL read the Blockchain RPC endpoint from the SOROBAN_RPC_URL environment variable
6. THE Sync_Service SHALL validate all required environment variables on startup and exit with an error message if any are missing
7. THE Sync_Service SHALL support running as a standalone process or as part of the existing backend application
