import multer from "multer";

const storage = multer.diskStorage({
    filename: function (req, file, callback) {
        // Prefix a unique token so files never collide on disk (e.g. two bulk-add
        // rows both uploading "photo.jpg" would otherwise overwrite each other).
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
        callback(null, `${unique}-${file.originalname}`)
    }
})

const upload = multer({ storage })

export default upload