import { v2 as cloudinary } from "cloudinary"

// Accept the primary env-var names used across this project as well as the
// names Cloudinary's own dashboard/docs suggest — so a mismatched key name in
// the hosting env (Vercel/Render) doesn't silently break uploads.
const readEnv = () => ({
    cloud_name: process.env.CLOUDINARY_NAME || process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_SECRET_KEY || process.env.CLOUDINARY_API_SECRET,
})

let configured = false

// Idempotently apply the Cloudinary config from the current environment.
// Safe to call on every request — configuring is cheap and this removes any
// dependency on module-load ordering / serverless cold-start timing (the usual
// cause of "Must supply api_key" on Vercel).
const envName = (k) =>
    k === 'cloud_name' ? 'CLOUDINARY_NAME' : k === 'api_key' ? 'CLOUDINARY_API_KEY' : 'CLOUDINARY_SECRET_KEY'

// A value that's still a template placeholder ("Paste Cloudinary API key here",
// "your-key", "xxxx", "----") is worse than missing — it looks set but Cloudinary
// rejects it with "Unknown API key". Catch those explicitly.
const looksLikePlaceholder = (v) =>
    /paste|your[-_ ]?|here|xxxx|example|placeholder|----|<.*>/i.test(String(v))

export const ensureCloudinary = () => {
    const cfg = readEnv()

    const missing = Object.entries(cfg).filter(([, v]) => !v).map(([k]) => envName(k))
    if (missing.length) {
        throw new Error(
            `Cloudinary is not configured — missing env var(s): ${missing.join(', ')}. ` +
            `Set them on the BACKEND deployment (the service that runs server.js), then redeploy.`
        )
    }

    const placeholders = Object.entries(cfg).filter(([, v]) => looksLikePlaceholder(v)).map(([k]) => envName(k))
    if (placeholders.length) {
        throw new Error(
            `Cloudinary env var(s) still contain placeholder text: ${placeholders.join(', ')}. ` +
            `Replace with the real value from your Cloudinary dashboard (Settings → API Keys) on the BACKEND deployment, then redeploy.`
        )
    }

    if (!configured) {
        cloudinary.config({ ...cfg, secure: true })
        configured = true
    }
    return cloudinary
}

// Called once at server start. Configures if possible, but never crashes boot
// when env is absent — the clear error is surfaced at upload time instead.
const connectCloudinary = async () => {
    try {
        ensureCloudinary()
        console.log('Cloudinary configured ✓')
    } catch (err) {
        console.warn('[cloudinary] ' + err.message)
    }
}

export default connectCloudinary
