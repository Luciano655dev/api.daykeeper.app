const { getSignedUrl } = require("@aws-sdk/cloudfront-signer")

// ── Local-storage URL helpers ─────────────────────────────────────────────
// When STORAGE_TYPE=local, files live on disk and are served as static files.
// This is only for local development — never set STORAGE_TYPE=local in prod.

function isLocalStorage() {
  return (process.env.STORAGE_TYPE || "s3") === "local"
}

function buildLocalMediaUrl(key) {
  const base = (process.env.LOCAL_UPLOAD_BASE_URL || `http://localhost:${process.env.PORT || 3000}`)
    .replace(/\/+$/, "")
  return `${base}/uploads/${key}`
}

// ─────────────────────────────────────────────────────────────────────────

function normalizeObjectKey(key) {
  if (typeof key !== "string") return ""
  return key.trim().replace(/^\/+/, "")
}

function isPublicKey(key) {
  return normalizeObjectKey(key).startsWith("public/")
}

function isPrivateKey(key) {
  return normalizeObjectKey(key).startsWith("private/")
}

function getCloudFrontDomain() {
  const raw = (process.env.CLOUDFRONT_DOMAIN || "").trim()
  if (!raw) return ""
  return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "")
}

function getCloudFrontBaseUrl() {
  const domain = getCloudFrontDomain()
  return domain ? `https://${domain}` : ""
}

function getSigningTtlSeconds() {
  const parsed = Number(process.env.CLOUDFRONT_SIGN_TTL_SECONDS)
  if (!Number.isFinite(parsed) || parsed <= 0) return 900
  return Math.floor(parsed)
}

function getSigningPrivateKey() {
  const raw = process.env.CLOUDFRONT_PRIVATE_KEY_PEM || ""
  if (!raw) return ""
  return raw.replace(/\\n/g, "\n")
}

function getCloudFrontSignedUrlForPrivateKey(objectKey, ttlSeconds) {
  const key = normalizeObjectKey(objectKey)
  const domain = getCloudFrontDomain()
  const keyPairId = (process.env.CLOUDFRONT_PUBLIC_KEY_ID || "").trim()
  const privateKey = getSigningPrivateKey()

  if (!key || !domain || !keyPairId || !privateKey) return ""

  const url = `https://${domain}/${key}`
  const ttl = Number.isFinite(Number(ttlSeconds))
    ? Number(ttlSeconds)
    : getSigningTtlSeconds()
  const expiresAt = new Date(Date.now() + Math.max(1, Math.floor(ttl)) * 1000)

  return getSignedUrl({
    url,
    keyPairId,
    privateKey,
    dateLessThan: expiresAt.toISOString(),
  })
}

function buildMediaUrlFromKey(objectKey, options = {}) {
  if (typeof objectKey !== "string") return ""
  const trimmed = objectKey.trim()
  if (!trimmed) return ""
  if (/^https?:\/\//i.test(trimmed)) return trimmed

  const key = normalizeObjectKey(trimmed)

  // Local development: skip CloudFront entirely
  if (isLocalStorage()) {
    return buildLocalMediaUrl(key)
  }

  const baseUrl = getCloudFrontBaseUrl()
  if (isPublicKey(key)) {
    if (!baseUrl) return ""
    return `${baseUrl}/${key}`
  }
  if (isPrivateKey(key)) {
    return getCloudFrontSignedUrlForPrivateKey(key, options.ttlSeconds)
  }

  return ""
}

module.exports = {
  normalizeObjectKey,
  isPublicKey,
  isPrivateKey,
  getCloudFrontBaseUrl,
  buildMediaUrlFromKey,
}
