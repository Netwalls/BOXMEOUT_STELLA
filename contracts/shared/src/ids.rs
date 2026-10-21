//! ============================================================
//! BOXMEOUT — Identifier Helpers
//! Conversions between the on-chain `market_id: Bytes` and the
//! compact `u64` used as an event topic.
//! ============================================================

use soroban_sdk::Bytes;

/// Extracts the numeric market identifier from a 32-byte `market_id`.
///
/// `MarketFactory::create_market` writes the creation nonce into bytes
/// `0..8` of `market_id` with `u64::to_le_bytes`, so this reads the same
/// eight bytes back as **little-endian**. The remaining bytes (fighter-name
/// and end-time entropy) are ignored, which makes the result equal to the
/// factory nonce and unique per market.
///
/// Every event emitter that publishes a `market_id` topic must use this
/// function so indexers can join events to factory records.
///
/// # Panics
///
/// Panics if `market_id` is shorter than 8 bytes.
pub fn market_id_to_u64(market_id: &Bytes) -> u64 {
    if market_id.len() < 8 {
        panic!("market_id must be at least 8 bytes");
    }
    let mut buf = [0u8; 8];
    market_id.slice(0..8).copy_into_slice(&mut buf);
    u64::from_le_bytes(buf)
}

#[cfg(test)]
mod tests {
    use super::market_id_to_u64;
    use soroban_sdk::{Bytes, Env};

    /// Builds a market_id exactly the way MarketFactory::create_market does.
    fn factory_style_id(env: &Env, nonce: u64, end_time: u64) -> Bytes {
        let mut id = [0u8; 32];
        id[0..8].copy_from_slice(&nonce.to_le_bytes());
        id[8..16].copy_from_slice(b"FIGHTERA");
        id[16..24].copy_from_slice(b"FIGHTERB");
        id[24..32].copy_from_slice(&end_time.to_le_bytes());
        Bytes::from_array(env, &id)
    }

    #[test]
    fn round_trips_factory_nonce() {
        let env = Env::default();
        for nonce in [0u64, 1, 2, 255, 256, 1_000_000, u64::MAX] {
            assert_eq!(
                market_id_to_u64(&factory_style_id(&env, nonce, 9_999)),
                nonce
            );
        }
    }

    #[test]
    fn reads_little_endian() {
        let env = Env::default();
        let mut id = [0u8; 32];
        id[0] = 0x01;
        id[7] = 0x02;
        let expected = 0x0200_0000_0000_0001u64;
        assert_eq!(market_id_to_u64(&Bytes::from_array(&env, &id)), expected);
    }

    #[test]
    fn ignores_bytes_after_nonce() {
        let env = Env::default();
        let a = factory_style_id(&env, 42, 1);
        let b = factory_style_id(&env, 42, u64::MAX);
        assert_eq!(market_id_to_u64(&a), market_id_to_u64(&b));
    }

    #[test]
    fn accepts_exactly_eight_bytes() {
        let env = Env::default();
        let id = Bytes::from_array(&env, &7u64.to_le_bytes());
        assert_eq!(market_id_to_u64(&id), 7);
    }

    #[test]
    #[should_panic(expected = "market_id must be at least 8 bytes")]
    fn panics_on_short_id() {
        let env = Env::default();
        market_id_to_u64(&Bytes::from_array(&env, &[1u8; 7]));
    }
}
