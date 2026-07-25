// RFC 4648 base32 (no padding), used to carry a case-sensitive Snack id inside a
// DNS subdomain label. Hostnames are case-insensitive (browsers lowercase
// them), so a raw mixed-case id can't survive there; base32's alphabet is
// [A-Z2-7], which is safe to lowercase and decode back losslessly.
//
// Runs in both the browser (share-link builder) and the edge middleware, so it
// uses only TextEncoder/TextDecoder — no Node Buffer.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
// Reverse lookup for decode (index by char code kept simple via indexOf).

export function base32Encode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1; // drop consumed high bits so value stays bounded
  }

  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

// Decodes a base32 label back to the original string. Case-insensitive (the
// label arrives lowercased). Throws on any character outside the alphabet.
export function base32Decode(input: string): string {
  const clean = input.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) {
      throw new Error(`invalid base32 character: ${ch}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }

  return new TextDecoder().decode(new Uint8Array(bytes));
}
