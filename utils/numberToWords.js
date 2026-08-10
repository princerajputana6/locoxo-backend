// Indian-format amount in words, e.g. 909 → "INR Nine Hundred Nine Rupees and Zero Paise Only"
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

const twoDigits = (n) => {
    if (n < 20) return ONES[n]
    const t = Math.floor(n / 10), o = n % 10
    return TENS[t] + (o ? ' ' + ONES[o] : '')
}

const threeDigits = (n) => {
    const h = Math.floor(n / 100), r = n % 100
    let s = ''
    if (h) s += ONES[h] + ' Hundred'
    if (r) s += (s ? ' ' : '') + twoDigits(r)
    return s
}

// Indian numbering: crore, lakh, thousand, hundred.
const intToWords = (num) => {
    if (num === 0) return 'Zero'
    let words = ''
    const crore = Math.floor(num / 10000000); num %= 10000000
    const lakh = Math.floor(num / 100000); num %= 100000
    const thousand = Math.floor(num / 1000); num %= 1000
    const rest = num
    if (crore) words += threeDigits(crore) + ' Crore '
    if (lakh) words += twoDigits(lakh) + ' Lakh '
    if (thousand) words += twoDigits(thousand) + ' Thousand '
    if (rest) words += threeDigits(rest)
    return words.trim()
}

// "INR Nine Hundred Nine Rupees and Zero Paise Only"
export const rupeesInWords = (amount) => {
    const rupees = Math.floor(Math.abs(amount))
    const paise = Math.round((Math.abs(amount) - rupees) * 100)
    const rWords = intToWords(rupees)
    const pWords = intToWords(paise)
    return `INR ${rWords} Rupees and ${paise === 0 ? 'Zero' : pWords} Paise Only`
}

export default rupeesInWords
