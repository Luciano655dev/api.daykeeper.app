const multer = require("multer")

const fileSizeLimit = 1024 * 1024 * 1024 // 1 GB

// Files are buffered in memory first.
// convertImageMW converts HEIC/HEIF → JPEG, then uploadToStorageMW
// writes to S3 or local disk before createMediaDocsMW runs.
const MulterConfig = (mediaType = "both") => {
  let allowedMimes = []

  switch (mediaType) {
    case "image":
      allowedMimes = [
        "image/jpeg",
        "image/pjpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
      ]
      break
    case "both":
      allowedMimes = [
        "image/jpeg",
        "image/pjpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
        "image/gif",
        "video/mp4",
        "video/quicktime",
        "video/x-msvideo",
        "video/x-ms-wmv",
      ]
      break
    default:
      throw new Error("Unsupported media type")
  }

  return {
    storage: multer.memoryStorage(),
    limits: { fileSize: fileSizeLimit },
    fileFilter: (req, file, cb) => {
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true)
      } else {
        cb(new Error("Invalid file type."))
      }
    },
  }
}

module.exports = MulterConfig
