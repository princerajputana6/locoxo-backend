// Barcode / product-code helpers for inventory.
//
// Two representations per spec:
//  1. Human-readable label string  → category(1st word) + name(first 2 words)
//     + size + colour(first 3 letters) + stock number.  e.g. MALE-COTTONTEE-M-BLA-10
//  2. Indian scannable EAN-13      → GS1 India prefix 890 + 9-digit serial + check digit.

const clean = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '')

// First `n` whitespace-separated words of a string, concatenated & cleaned.
const firstWords = (s, n) =>
    clean(String(s || '').trim().split(/\s+/).slice(0, n).join(''))

// Human-readable barcode string. Follows the requirement doc's format exactly.
export const humanBarcode = ({ category, name, size, color, stock }) => {
    const cat = clean(String(category || '').trim().split(/\s+/)[0] || '').slice(0, 6) || 'GEN'
    const nm = firstWords(name, 2).slice(0, 8) || 'PRD'
    const sz = clean(size).slice(0, 4) || 'FR'
    const col = clean(color).slice(0, 3) || 'CLR'
    const st = Number.isFinite(Number(stock)) ? Number(stock) : 0
    return `${cat}-${nm}-${sz}-${col}-${st}`
}

// EAN-13 check digit for a 12-digit numeric string.
const ean13Check = (d12) => {
    let sum = 0
    for (let i = 0; i < 12; i++) {
        sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3)
    }
    return (10 - (sum % 10)) % 10
}

// Build a full 13-digit EAN-13 from a numeric serial, using the GS1 India
// prefix 890. Serial is zero-padded to 9 digits (890 + 9 = 12, + check = 13).
export const ean13FromSerial = (serial) => {
    const body = '890' + String(serial).replace(/\D/g, '').padStart(9, '0').slice(-9)
    return body + ean13Check(body)
}

// LX2026<NO> product code. Sequence is zero-padded to at least 2 digits.
export const productCode = (year, seq) =>
    `LX${year}${String(seq).padStart(2, '0')}`
