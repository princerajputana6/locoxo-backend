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
export const ensureCloudinary = () => {
    const cfg = readEnv()

    const missing = Object.entries(cfg)
        .filter(([, v]) => !v)
        .map(([k]) => k)

    if (missing.length) {
        throw new Error(
            `Cloudinary is not configured — missing env var(s): ${missing
                .map((k) => (k === 'cloud_name' ? 'CLOUDINARY_NAME' : k === 'api_key' ? 'CLOUDINARY_API_KEY' : 'CLOUDINARY_SECRET_KEY'))
                .join(', ')}. Add them to your deployment environment and redeploy.`
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
