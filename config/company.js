// ─────────────────────────────────────────────────────────────────────────────
// LOCOXO company / legal details used on the GST tax invoice and the apparel
// price-tag label.
//
// >>> EDIT THE VALUES MARKED "TODO" WITH LOCOXO'S REAL LEGAL DETAILS. <<<
// GSTIN, the registered/manufacturer address and customer-care contacts appear
// on legal documents, so placeholders MUST be replaced before going live.
// Values can also be supplied via environment variables (they win when set).
// ─────────────────────────────────────────────────────────────────────────────

const env = (k, fallback) => (process.env[k] && String(process.env[k]).trim()) || fallback

const company = {
    // Brand + legal entity
    brand: 'LOCOXO',
    legalName: env('COMPANY_LEGAL_NAME', 'Locoxo Retail Private Limited'), // TODO: exact registered name

    // Registered / manufacturer address (also the label's manufacturer block)
    address: {
        line1: env('COMPANY_ADDR_LINE1', 'TODO: Registered office address line 1'),
        line2: env('COMPANY_ADDR_LINE2', 'TODO: address line 2'),
        city: env('COMPANY_CITY', 'New Delhi'),
        state: env('COMPANY_STATE', 'Delhi'),
        stateCode: env('COMPANY_STATE_CODE', '07'),   // GST state code (Delhi = 07)
        pincode: env('COMPANY_PINCODE', '110001'),
        country: env('COMPANY_COUNTRY', 'India'),
    },

    // Tax / statutory
    gstin: env('COMPANY_GSTIN', 'TODO_GSTIN_15_CHARS'),        // TODO: 15-char GSTIN
    hsnCode: env('PRODUCT_HSN_CODE', '61091000'),              // apparel default (T-shirts)
    gstRate: Number(env('GST_RATE', '5')),                    // % — apparel ≤ ₹1000 is 5%
    countryOfOrigin: env('COMPANY_COUNTRY', 'India'),

    // Customer care (label + invoice footer)
    care: {
        phone: env('SUPPORT_PHONE', '+91-00000-00000'),        // TODO
        email: env('SUPPORT_EMAIL', 'care@locoxo.com'),        // TODO
        tollFree: env('SUPPORT_TOLLFREE', ''),                 // optional
    },

    website: env('COMPANY_WEBSITE', 'www.locoxo.com'),
    poweredBy: env('INVOICE_POWERED_BY', 'Locoxo'),
}

export default company
