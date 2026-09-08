// Barcode / product-code helpers for inventory.
//
// Two representations:
//  1. Human-readable label string  → productCode + name(first 3 letters) +
//     category(first 3 letters) + size + colour(first 3 letters) + number.
//     e.g. LX202601-NEW-TSH-M-DAR-16
//  2. Indian scannable EAN-13      → GS1 India prefix 890 + 9-digit serial + check digit.

const clean = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '')

// Human-readable barcode string:
//   <productCode>-<name 3 letters>-<category 3 letters>-<size>-<colour 3 letters>-<number>
// `number` is the stock count for a stored/summary code, or the running unit
// number (1,2,3…) on an individual per-unit tag.
export const humanBarcode = ({ productCode, category, name, size, color, stock, number }) => {
    const code = clean(productCode)
    const nm = clean(name).slice(0, 3) || 'PRD'
    const cat = clean(category).slice(0, 3) || 'GEN'
    const sz = clean(size).slice(0, 4) || 'FR'
    const col = clean(color).slice(0, 3) || 'CLR'
    const n = number !== undefined ? number : stock
    const num = Number.isFinite(Number(n)) ? Number(n) : 0
    return [code, nm, cat, sz, col, num].filter((x) => x !== '' && x !== undefined && x !== null).join('-')
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
