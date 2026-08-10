import { nextSeq } from '../models/counterModel.js'

// Order id format per requirement doc: LX<YEAR>100<NO>, e.g. LX2026100001.
// The sequence is per-year and zero-padded to at least 3 digits.
export const generateOrderNumber = async () => {
    const year = new Date().getFullYear()
    const seq = await nextSeq(`orderNumber:${year}`)
    return `LX${year}100${String(seq).padStart(3, '0')}`
}

// Display customer id: first 3 letters of name + last 5 digits of phone.
// e.g. "Prince" + "…63229" → PRI63229.  Falls back gracefully when data is missing.
export const customerIdFor = (user) => {
    if (!user) return ''
    const name = String(user.name || 'CUS').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X')
    const phone = String(user.phone || user.mobile || '').replace(/\D/g, '')
    const tail = phone.slice(-5) || String(user._id || '').slice(-5)
    return `${name}${tail}`
}
