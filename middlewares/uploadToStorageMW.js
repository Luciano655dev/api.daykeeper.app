const crypto = require("crypto")
const path = require("path")
const fs = require("fs")
const { promisify } = require("util")

const awsS3Config = require("../api/config/awsS3Config")
const {
  aws: { bucketName, storageType },
} = require("../config")

const writeFile = promisify(fs.writeFile)
const mkdir = promisify(fs.mkdir)

const localUploadsDir = path.resolve(__dirname, "..", "api", "tmp", "uploads")

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
  const reqPath = String(req?.path || "")
  const originalUrl = String(req?.originalUrl || "").split("?")[0]
  const routeHint = `${baseUrl}${reqPath} ${originalUrl}`.toLowerCase()

  if (routeHint.includes("/post")) {
    return `raw/users/${sanitizeSegment(userId)}/posts/${fileType}`
  }
  if (routeHint.includes("/day-pages") || routeHint.includes("/day-page")) {
    return `public/users/${sanitizeSegment(userId)}/day-pages/${fileType}`
  }
  if (routeHint.includes("/user") || routeHint.includes("/update_user")) {
    return `public/users/${sanitizeSegment(userId)}/profile/${fileType}`
  }
  return `raw/uploads/${fileType}`
}

// Uploads each buffered file to S3 (or local disk in dev) and sets file.key.
// Must run after multer (memoryStorage) and convertImageMW, before createMediaDocsMW.
async function uploadToStorageMW(req, res, next) {
  const files = req.files?.length ? req.files : req.file ? [req.file] : []
  if (!files.length) return next()

  try {
    for (const file of files) {
      if (!file.buffer) continue

      const hash = crypto.randomBytes(16).toString("hex")
      const safeName = sanitizeSegment(file.originalname, "upload")
      const fileType = file.mimetype.startsWith("video") ? "videos" : "images"

      if (storageType === "s3") {
        const prefix = getUploadPrefix(req, fileType)
        const key = `${prefix}/${hash}-${safeName}`

        await awsS3Config
          .upload({
            Bucket: bucketName,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
          })
          .promise()

        file.key = key
      } else {
        // Local storage (development)
        await mkdir(localUploadsDir, { recursive: true })
        const fileName = `${hash}-${safeName}`
        await writeFile(path.join(localUploadsDir, fileName), file.buffer)
        file.key = fileName
        file.filename = fileName
      }

      delete file.buffer
    }

    next()
  } catch (err) {
    console.error("[uploadToStorageMW]", err)
    return res.status(500).json({ message: "File upload failed." })
  }
}

module.exports = uploadToStorageMW
