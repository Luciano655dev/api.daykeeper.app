const multer = require("multer")
const path = require("path")
const crypto = require("crypto")
const fs = require("fs")
const multerS3 = require("multer-s3")
const awsS3Config = require("./awsS3Config")
const {
  aws: { bucketName, storageType },
} = require("../../config")

function sanitizeSegment(value, fallback = "file") {
  const sanitized = String(value || fallback)
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
  return sanitized || fallback
}

function getUploadPrefix(req, fileType) {
  const userId = req?.user?._id ? String(req.user._id) : "anonymous"
  const baseUrl = String(req?.baseUrl || "")
  const path = String(req?.path || "")
  const originalUrl = String(req?.originalUrl || "").split("?")[0]
  const routeHint = `${baseUrl}${path} ${originalUrl}`.toLowerCase()

  if (routeHint.includes("/post")) {
    return `raw/users/${sanitizeSegment(userId)}/posts/${fileType}`
  }

  if (routeHint.includes("/day-pages") || routeHint.includes("/day-page")) {
    return `public/users/${sanitizeSegment(userId)}/day-pages/${fileType}`
  }

  if (routeHint.includes("/user")) {
    return `public/users/${sanitizeSegment(userId)}/profile/${fileType}`
  }

  return `raw/uploads/${fileType}`
}

// Ensure local upload dir exists (for local use)
const uploadDir = path.resolve(__dirname, "..", "tmp", "uploads")
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storageTypes = {
  local: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir)
    },
    filename: (req, file, cb) => {
      crypto.randomBytes(16, (err, hash) => {
        if (err) return cb(err)
        const safeName = sanitizeSegment(file.originalname, "upload")
        const fileName = `${hash.toString("hex")}-${safeName}`
        // Set file.key to match what createMediaDocsMW expects (mirrors multer-s3 behaviour)
        file.key = fileName
        cb(null, fileName)
      })
    },
  }),

  s3: multerS3({
    s3: awsS3Config,
    bucket: bucketName,
    contentType: (req, file, cb) => {
      const mime = file.mimetype
      if (mime.startsWith("image/") || mime.startsWith("video/")) {
        cb(null, mime)
      } else {
        cb(new Error("Unsupported media type"))
      }
    },
    key: (req, file, cb) => {
      crypto.randomBytes(16, (err, hash) => {
        if (err) return cb(err)
        const fileType = file.mimetype.startsWith("video") ? "videos" : "images"
        const safeName = sanitizeSegment(file.originalname, "upload")
        const prefix = getUploadPrefix(req, fileType)
        const fileName = `${prefix}/${hash.toString("hex")}-${safeName}`
        const fileUrl = `https://${bucketName}.s3.amazonaws.com/${fileName}`
        file.url = fileUrl
        cb(null, fileName)
      })
    },
  }),
}

const fileSizeLimit = 1024 * 1024 * 1024 // 1 GB

const MulterConfig = (mediaType = "both") => {
  let allowedMimes = []

  switch (mediaType) {
    case "image":
      allowedMimes = ["image/jpeg", "image/pjpeg", "image/png"]
      break
    case "both":
      allowedMimes = [
        "image/jpeg",
        "image/pjpeg",
        "image/png",
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
    dest: uploadDir,
    storage: storageTypes[storageType],
    limits: {
      fileSize: fileSizeLimit,
    },
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
