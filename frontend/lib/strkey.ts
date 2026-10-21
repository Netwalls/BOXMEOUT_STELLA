// Stellar StrKey validation: base32 alphabet, version byte, and CRC16-XModem checksum.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ED25519_PUBLIC_KEY_VERSION = 6 << 3; // the version byte that gives a leading "G"
const PUBLIC_KEY_BYTES = 35; // version (1) + key (32) + checksum (2)

function base32Decode(input: string): Uint8Array | null {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of input) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) return null;
    buffer = ((buffer << 5) | index) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Uint8Array.from(out);
}

function crc16XModem(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/**
 * True when `address` is a well-formed Stellar account address (a G... StrKey) whose
 * checksum matches. A typo in an otherwise valid-looking address fails here.
 */
export function isValidStellarPublicKey(address: string): boolean {
  if (!/^G[A-Z2-7]{55}$/.test(address)) return false;

  const bytes = base32Decode(address);
  if (!bytes || bytes.length !== PUBLIC_KEY_BYTES) return false;
  if (bytes[0] !== ED25519_PUBLIC_KEY_VERSION) return false;

  const payload = bytes.subarray(0, PUBLIC_KEY_BYTES - 2);
  const checksum = bytes[PUBLIC_KEY_BYTES - 2] | (bytes[PUBLIC_KEY_BYTES - 1] << 8);
  return crc16XModem(payload) === checksum;
}
