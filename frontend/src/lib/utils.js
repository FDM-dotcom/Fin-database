/**
 * Gedeelde hulpfuncties.
 * Werkt in zowel HTTPS (secure context) als HTTP (LAN-toegang).
 */

/**
 * Genereer een unieke ID zonder crypto.randomUUID() (vereist secure context).
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

/**
 * SHA-256 hash als hex-string.
 * Gebruikt crypto.subtle wanneer beschikbaar (HTTPS/localhost).
 * Valt terug op een pure-JS hash voor HTTP LAN-toegang.
 */
export async function sha256(str) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    } catch {
      // Valt door naar fallback als subtle niet werkt (bijv. mixed content)
    }
  }
  return _hashFallback(str)
}

/**
 * Deterministische 64-hex-char hash voor niet-secure contexten.
 * Voldoende collision-resistent voor transactie-deduplicatie.
 */
function _hashFallback(str) {
  const bytes = new TextEncoder().encode(str)
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    h0 = (Math.imul(h0 ^ b, 0x9e3779b9) + h1) >>> 0
    h1 = (Math.imul(h1 ^ h0, 0x6c62272e) + h2) >>> 0
    h2 = (Math.imul(h2 ^ h1, 0x9e3779b9) + h3) >>> 0
    h3 = (Math.imul(h3 ^ h2, 0x6c62272e) + h4) >>> 0
    h4 = (Math.imul(h4 ^ h3, 0x9e3779b9) + h5) >>> 0
    h5 = (Math.imul(h5 ^ h4, 0x6c62272e) + h6) >>> 0
    h6 = (Math.imul(h6 ^ h5, 0x9e3779b9) + h7) >>> 0
    h7 = (Math.imul(h7 ^ h6, 0x6c62272e) + h0) >>> 0
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((n) => (n >>> 0).toString(16).padStart(8, '0'))
    .join('')
}
