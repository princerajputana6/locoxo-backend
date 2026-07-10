// Email service (nodemailer over SMTP). Uses dynamic import so the backend
// boots even if `nodemailer` isn't installed yet, and degrades gracefully
// (logs the message) when SMTP isn't configured.

let transporterPromise = null;

const isConfigured = () =>
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    !String(process.env.SMTP_HOST).includes('Paste');

const getTransporter = async () => {
    if (!transporterPromise) {
        const { default: nodemailer } = await import('nodemailer');
        transporterPromise = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for 587
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
    }
    return transporterPromise;
};

// Send an email. Returns { sent, dev } — dev=true when SMTP isn't configured.
const sendMail = async ({ to, subject, html, text }) => {
    if (!isConfigured()) {
        console.warn('[emailService] SMTP not configured — email NOT sent. Preview below:');
        console.warn(`  To: ${to}\n  Subject: ${subject}\n  ${text || ''}`);
        return { sent: false, dev: true };
    }
    const transporter = await getTransporter();
    await transporter.sendMail({
        from: process.env.SMTP_FROM || `LOCOXO <${process.env.SMTP_USER}>`,
        to, subject, html, text,
    });
    return { sent: true, dev: false };
};

// Branded password-reset email
const sendPasswordResetEmail = async (to, name, resetLink) => {
    const html = `
    <div style="font-family:Montserrat,Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e6ec;border-radius:12px;overflow:hidden">
      <div style="background:#062B52;padding:24px;text-align:center">
        <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:2px">LOCO<span style="color:#F59A23">XO</span></span>
      </div>
      <div style="padding:28px;color:#333">
        <h2 style="margin:0 0 12px;color:#062B52">Reset your password</h2>
        <p>Hi ${name || 'there'},</p>
        <p>We received a request to reset your LOCOXO password. Click the button below to set a new one. This link expires in 1 hour.</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${resetLink}" style="background:#F59A23;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;display:inline-block">Reset Password</a>
        </p>
        <p style="font-size:13px;color:#667">If the button doesn't work, copy this link into your browser:</p>
        <p style="font-size:12px;word-break:break-all;color:#0E4F86">${resetLink}</p>
        <p style="font-size:13px;color:#667;margin-top:24px">If you didn't request this, you can safely ignore this email — your password won't change.</p>
      </div>
    </div>`;
    const text = `Reset your LOCOXO password: ${resetLink} (expires in 1 hour). If you didn't request this, ignore this email.`;
    return sendMail({ to, subject: 'Reset your LOCOXO password', html, text });
};

export { sendMail, sendPasswordResetEmail, isConfigured };
