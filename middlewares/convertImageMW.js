const sharp = require("sharp")

const HEIC_TYPES = new Set(["image/heic", "image/heif"])

// Converts HEIC/HEIF images to JPEG so they display correctly on all platforms.
// Must run after multer (memoryStorage) and before uploadToStorageMW.
async function convertImageMW(req, res, next) {
  const files = req.files?.length ? req.files : req.file ? [req.file] : []
  if (!files.length) return next()

  try {
    for (const file of files) {
      if (!file.buffer || !HEIC_TYPES.has(file.mimetype)) continue

      file.buffer = await sharp(file.buffer).jpeg({ quality: 90 }).toBuffer()
      file.mimetype = "image/jpeg"
      file.originalname = file.originalname.replace(/\.(heic|heif)$/i, ".jpg")
      if (!/\.(jpg|jpeg)$/i.test(file.originalname)) file.originalname += ".jpg"
      file.size = file.buffer.length
    }
    next()
  } catch (err) {
    console.error("[convertImageMW]", err)
    return res.status(400).json({ message: "Failed to process image." })
  }
}

module.exports = convertImageMW
