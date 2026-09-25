/* ------------------------------------------------------------------ *
 *  Self-contained SHA-256 + HMAC (synchronous, dependency-free).
 *
 *  Used for:
 *   - password hashing  ->  salt:sha256(salt + password)
 *   - license signing   ->  HMAC-SHA256(devKey, canonicalPayload)
 *
 *  SECURITY NOTE: the license signer here is a clearly-marked LOCAL /
 *  DEV signer. A production deployment must sign licenses server-side
 *  with an asymmetric private key (RSA / Ed25519) held only by
 *  NxtGenSol, and NxtHealth would verify with the matching public key.
 *  The verify() call is already isolated in LicenseService so the
 *  crypto backend can be replaced without touching any UI.
 * ------------------------------------------------------------------ */

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function rotr(x: number, n: number) {
  return (x >>> n) | (x << (32 - n))
}

function sha256Bytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]
  const l = bytes.length
  const bitLen = l * 8
  const withOne = l + 1
  const total = withOne + ((56 - (withOne % 64) + 64) % 64) + 8
  const msg = new Uint8Array(total)
  msg.set(bytes)
  msg[l] = 0x80
  // 64-bit big-endian length (high 32 bits assumed 0 for our sizes)
  const dv = new DataView(msg.buffer)
  dv.setUint32(total - 4, bitLen >>> 0, false)
  dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000), false)

  const w = new Uint32Array(64)
  for (let i = 0; i < total; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4, false)
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3)
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10)
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = H
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    H[0] = (H[0] + a) >>> 0
    H[1] = (H[1] + b) >>> 0
    H[2] = (H[2] + c) >>> 0
    H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0
    H[5] = (H[5] + f) >>> 0
    H[6] = (H[6] + g) >>> 0
    H[7] = (H[7] + h) >>> 0
  }
  const out = new Uint8Array(32)
  const odv = new DataView(out.buffer)
  H.forEach((h, i) => odv.setUint32(i * 4, h, false))
  return out
}

const enc = new TextEncoder()
function toHex(b: Uint8Array): string {
  let s = ''
  for (const x of b) s += x.toString(16).padStart(2, '0')
  return s
}

export function sha256(text: string): string {
  return toHex(sha256Bytes(enc.encode(text)))
}

export function hmacSha256(key: string, message: string): string {
  const blockSize = 64
  let keyBytes: Uint8Array<ArrayBuffer> = enc.encode(key)
  if (keyBytes.length > blockSize) keyBytes = sha256Bytes(keyBytes)
  const padded = new Uint8Array(blockSize)
  padded.set(keyBytes)
  const oKey = new Uint8Array(blockSize)
  const iKey = new Uint8Array(blockSize)
  for (let i = 0; i < blockSize; i++) {
    oKey[i] = padded[i] ^ 0x5c
    iKey[i] = padded[i] ^ 0x36
  }
  const msgBytes = enc.encode(message)
  const inner = sha256Bytes(concat(iKey, msgBytes))
  return toHex(sha256Bytes(concat(oKey, inner)))
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

/* ---------------- password helpers ---------------- */

export function randomHex(bytes = 8): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return toHex(a)
}

export function hashPassword(password: string, salt = randomHex(8)): string {
  // stored form: salt:hash
  return `${salt}:${sha256(salt + password)}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  return sha256(salt + password) === hash
}

/** Human-friendly temporary password, e.g. "Nxt-7f3a91" */
export function tempPassword(): string {
  return `Nxt-${randomHex(3)}`
}
