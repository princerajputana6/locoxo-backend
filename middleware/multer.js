import multer from "multer";

// Max accepted size per image, for BOTH single Add Product and Bulk Add uploads.
export const MAX_IMAGE_MB = 5;

const storage = multer.diskStorage({
    filename: function (req, file, callback) {
        // Prefix a unique token so files never collide on disk (e.g. two bulk-add
        // rows both uploading "photo.jpg" would otherwise overwrite each other).
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
        callback(null, `${unique}-${file.originalname}`)
    }
})

const upload = multer({
    storage,
    limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        // Only accept images (jpeg/png/webp/gif/…). Rejects PDFs, videos, etc.
        if (file.mimetype && file.mimetype.startsWith('image/')) callback(null, true)
        else callback(new Error('Only image files are allowed'))
    },
})

// Product media: images (≤5MB each) + short videos (≤60MB) for the size chart,
// walk-through / 360 clips. Videos are validated by size on the field limit.
export const MAX_VIDEO_MB = 60;
export const uploadMedia = multer({
    storage,
    limits: { fileSize: MAX_VIDEO_MB * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        if (file.fieldname === 'video') {
            if (file.mimetype?.startsWith('video/')) return callback(null, true)
            return callback(new Error('Only video files are allowed for the video field'))
        }
        if (file.mimetype?.startsWith('image/')) return callback(null, true)
        callback(new Error('Only image/video files are allowed'))
    },
})

// Spreadsheet import (.xlsx / .xls / .csv) for bulk product import.
export const uploadImport = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname)
            || /spreadsheet|excel|csv/i.test(file.mimetype || '')
        if (ok) callback(null, true)
        else callback(new Error('Only .xlsx, .xls or .csv files are allowed'))
    },
})

export default upload