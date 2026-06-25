// Twilio Verify based OTP service.
// Uses dynamic import so the backend still boots if `twilio` isn't installed yet
// and degrades gracefully when credentials are not configured.

let clientPromise = null;

const isConfigured = () =>
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_VERIFY_SERVICE_SID &&
    !process.env.TWILIO_ACCOUNT_SID.includes('Paste');

const getClient = async () => {
    if (!clientPromise) {
        const { default: twilio } = await import('twilio');
        clientPromise = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    }
    return clientPromise;
};

// Normalise an Indian number to E.164 (+91...) if no country code present.
const normalisePhone = (phone) => {
    let p = String(phone || '').trim().replace(/[\s-()]/g, '');
    if (!p) return '';
    if (p.startsWith('+')) return p;
    if (p.length === 10) return '+91' + p; // default to India
    return '+' + p;
};

// Send an OTP to the given phone number.
const sendOtp = async (phone, channel = 'sms') => {
    const to = normalisePhone(phone);
    if (!to) throw new Error('Invalid phone number');

    if (!isConfigured()) {
        // Dev fallback so the flow is testable without Twilio credentials.
        console.warn('[twilioService] Twilio not configured — using DEV OTP 123456');
        return { to, dev: true };
    }

    const client = await getClient();
    const verification = await client.verify.v2
        .services(process.env.TWILIO_VERIFY_SERVICE_SID)
        .verifications.create({ to, channel });

    return { to, status: verification.status };
};

// Verify a submitted OTP code.
const checkOtp = async (phone, code) => {
    const to = normalisePhone(phone);
    if (!to) throw new Error('Invalid phone number');

    if (!isConfigured()) {
        return { to, approved: code === '123456', dev: true };
    }

    const client = await getClient();
    const check = await client.verify.v2
        .services(process.env.TWILIO_VERIFY_SERVICE_SID)
        .verificationChecks.create({ to, code });

    return { to, approved: check.status === 'approved', status: check.status };
};

export { sendOtp, checkOtp, normalisePhone, isConfigured };
