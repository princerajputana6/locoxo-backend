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
    // Brand + legal entity (from GST Registration Certificate 03AANFL1410E1ZY)
    brand: 'LOCOXO',
    legalName: env('COMPANY_LEGAL_NAME', 'LOCOXO APPARELS'),   // Partnership firm

    // Registered / manufacturer address (also the label's manufacturer block)
    address: {
        line1: env('COMPANY_ADDR_LINE1', '2400/67, Friends Colony'),
        line2: env('COMPANY_ADDR_LINE2', 'Street No.2, Badi Haibowal'),
        city: env('COMPANY_CITY', 'Ludhiana'),
        state: env('COMPANY_STATE', 'Punjab'),
        stateCode: env('COMPANY_STATE_CODE', '03'),   // GST state code (Punjab = 03)
        pincode: env('COMPANY_PINCODE', '141001'),
        country: env('COMPANY_COUNTRY', 'India'),
    },

    // Tax / statutory
    gstin: env('COMPANY_GSTIN', '03AANFL1410E1ZY'),            // 15-char GSTIN
    hsnCode: env('PRODUCT_HSN_CODE', '61091000'),              // apparel default (T-shirts)
    gstRate: Number(env('GST_RATE', '5')),                    // % — apparel ≤ ₹1000 is 5%, >₹1000 is 12%
    countryOfOrigin: env('COMPANY_COUNTRY', 'India'),

    // Customer care (label + invoice footer) — EDIT with Locoxo's real contacts.
    care: {
        phone: env('SUPPORT_PHONE', '+91 88245 89682'),        // customer-care phone
        email: env('SUPPORT_EMAIL', 'support@locoxo.com'),     // customer-care email
        tollFree: env('SUPPORT_TOLLFREE', ''),                 // optional
    },

    website: env('COMPANY_WEBSITE', 'www.locoxo.com'),
    poweredBy: env('INVOICE_POWERED_BY', 'Locoxo'),
}

export default company
