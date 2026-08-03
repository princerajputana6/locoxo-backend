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

export default upload