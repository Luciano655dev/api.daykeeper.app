const { Worker } = require("bullmq")
const IORedis = require("ioredis")
const fs = require("fs")
const path = require("path")
const AWS = require("aws-sdk")
const Media = require("../api/models/Media")
const Post = require("../api/models/Post")
const generateVideoThumbnails = require("../api/utils/generateVideoThumbnails")
const { createNotification } = require("../api/services/notification/createNotification")
const { ensureSinglePostMediaPrivacy } = require("../api/utils/postMediaPrivacy")

/* Imports and Config */
const { inappropriateLabels } = require("../constants/index")
const {
  redis: { url: redisUrl },
  aws: { accessKeyId, secretAccessKey, defaultRegion, bucketName },
} = require("../config")

AWS.config.update({ accessKeyId, secretAccessKey, region: defaultRegion })
const rekognition = new AWS.Rekognition()
const s3 = new AWS.S3()
const parseBool = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback
  const normalized = String(value).trim().toLowerCase()
  if (["true", "1", "yes", "on"].includes(normalized)) return true
  if (["false", "0", "no", "off"].includes(normalized)) return false
  return fallback
}
const parseBoundedInt = (value, fallback, min, max) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}
const verboseWorkerLogs = parseBool(process.env.MODERATION_WORKER_VERBOSE_LOGS, false)
const debugLog = (...args) => {
  if (verboseWorkerLogs) console.log(...args)
}
const workerConcurrency = parseBoundedInt(
  process.env.MODERATION_WORKER_CONCURRENCY,
  1,
  1,
  5
)
const workerDrainDelaySec = parseBoundedInt(
  process.env.MODERATION_WORKER_DRAIN_DELAY_SEC,
  30,
  1,
  120
)
const workerStalledIntervalMs = parseBoundedInt(
  process.env.MODERATION_WORKER_STALLED_INTERVAL_MS,
  60000,
  5000,
  300000
)
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
})

connection.on("connect", () => {
  debugLog("[worker] Redis connect")
})

connection.on("ready", () => {
  debugLog("[worker] Redis ready")
})

connection.on("error", (err) => {
  console.error("[worker] Redis error", err)
})

const updateMedia = async (mediaId, isSafe) => {
  try {
    const newStatus = isSafe ? "public" : "rejected"
    debugLog(`media ${mediaId} is ${newStatus}`)

    const media = await Media.findByIdAndUpdate(
      mediaId,
      {
        status: newStatus,
        verified: true,
      },
      { new: true }
    )
    if (!media) return { media: null, newStatus }

    if (media?.usedIn?.model == "Post") {
      const post = await Post.findById(media?.usedIn?.refId).select(
        "_id user privacy media",
      )
      if (isSafe && post) {
        await ensureSinglePostMediaPrivacy({ media, post })
      }

      if (post?.media?.length) {
        const medias = await Media.find({ _id: { $in: post.media } }).select(
          "status"
        )

        const hasRejected = medias.some((m) => m.status === "rejected")
        const allPublic =
          medias.length > 0 && medias.every((m) => m.status === "public")

        const postStatus = hasRejected
          ? "rejected"
          : allPublic
          ? "public"
          : "pending"

        debugLog("[worker] post status recalculated", {
          postId: post._id,
          postStatus,
          mediaStatuses: medias.map((m) => m.status),
        })

        await Post.findByIdAndUpdate(post._id, { status: postStatus })
      }
    }
    return { media, newStatus }
  } catch (error) {
    console.log("error at updateMedia")
    console.error(error)
    return { media: null, newStatus: null }
  }
}

const formatPostDate = (postDate) => {
  if (!postDate) return null
  try {
    return new Date(postDate).toISOString().slice(0, 10)
  } catch {
    return null
  }
}

const notifyModerationStarted = async (job) => {
  try {
    const { mediaId, uploadedBy } = job.data || {}
    if (!uploadedBy || !mediaId) return

    const media = await Media.findById(mediaId).lean()
    if (!media) return

    const postId = media?.usedIn?.refId
    const post = postId ? await Post.findById(postId).lean() : null
    const postDate = formatPostDate(post?.date || post?.created_at)
    const mediaTitle = media?.title || "media"

    await createNotification({
      userId: uploadedBy,
      type: "moderation_started",
      title: "Media review started",
      body: postDate
        ? `We are reviewing ${mediaTitle} from ${postDate}.`
        : `We are reviewing ${mediaTitle} for safety.`,
      data: {
        mediaId,
        mediaTitle,
        postId: post?._id || postId || null,
        postDate,
      },
    })
  } catch (error) {
    console.error("Failed to send moderation start notification", {
      error: error?.message || error,
      mediaId: job.data?.mediaId,
      uploadedBy: job.data?.uploadedBy,
    })
  }
}

const notifyModerationFinished = async ({ media, newStatus, fallbackUserId }) => {
  try {
    const userId = media?.uploadedBy || fallbackUserId
    if (!userId) return

    const postId = media?.usedIn?.refId || null
    const post = postId ? await Post.findById(postId).lean() : null
    const postDate = formatPostDate(post?.date || post?.created_at)
    const mediaTitle = media?.title || "media"
    const statusLabel = newStatus === "public" ? "approved" : "rejected"

    await createNotification({
      userId,
      type: "moderation_finished",
      title: "Media review completed",
      body: postDate
        ? `Your ${mediaTitle} from ${postDate} was ${statusLabel}.`
        : `Your ${mediaTitle} was ${statusLabel}.`,
      data: {
        mediaId: media?._id,
        mediaTitle,
        status: newStatus,
        postId,
        postDate,
      },
    })
  } catch (error) {
    console.error("Failed to send moderation finished notification", {
      error: error?.message || error,
      mediaId: media?._id,
      uploadedBy: fallbackUserId,
      newStatus,
    })
  }
}

// Main Worker
const worker = new Worker(
  "moderationQueue",
  async (job) => {
    const { key, type, mediaId } = job.data
    const tempDir = path.join(__dirname, "..", "tmp", "thumbs")
    debugLog(`worker iniciado para ${mediaId}`)
    debugLog(`LOG: bucketName: ${bucketName}; key: ${key}`)
    debugLog("[worker] job data", job.data)

    if (type === "image") {
      debugLog("TYPE: IMAGEM")
      const res = await rekognition
        .detectModerationLabels({
          Image: { S3Object: { Bucket: bucketName, Name: key } },
        })
        .promise()

      const isSafe = res.ModerationLabels.every(
        (label) =>
          !inappropriateLabels.includes(label.Name) || label.Confidence < 90,
      )

      const result = await updateMedia(mediaId, isSafe)
      await notifyModerationFinished({
        media: result?.media,
        newStatus: result?.newStatus,
        fallbackUserId: job.data?.uploadedBy,
      })

      return
    }

    debugLog("TYPE: VIDEO")
    // Vídeo
    fs.mkdirSync(tempDir, { recursive: true })
    const videoPath = path.join(
      tempDir,
      `${Date.now()}-${key.split("/").pop()}`,
    )
    const s3File = await s3
      .getObject({ Bucket: bucketName, Key: key })
      .promise()
    fs.writeFileSync(videoPath, s3File.Body)

    let thumbs = []
    try {
      thumbs = await generateVideoThumbnails(videoPath, tempDir)
      let isSafe = true

      for (const thumb of thumbs) {
        const buffer = fs.readFileSync(thumb)
        const res = await rekognition
          .detectModerationLabels({ Image: { Bytes: buffer } })
          .promise()

        const hasBadLabel = res.ModerationLabels.some(
          (label) =>
            inappropriateLabels.includes(label.Name) && label.Confidence >= 90,
        )

        if (hasBadLabel) {
          isSafe = false
          break
        }
      }

      const result = await updateMedia(mediaId, isSafe)
      await notifyModerationFinished({
        media: result?.media,
        newStatus: result?.newStatus,
        fallbackUserId: job.data?.uploadedBy,
      })
    } finally {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath)
      if (thumbs.length > 0) {
        const jobDir = path.dirname(thumbs[0])
        thumbs.forEach((thumb) => { if (fs.existsSync(thumb)) fs.unlinkSync(thumb) })
        if (fs.existsSync(jobDir)) fs.rmSync(jobDir, { recursive: true, force: true })
      }
    }
  },
  {
    connection,
    concurrency: workerConcurrency,
    drainDelay: workerDrainDelaySec,
    stalledInterval: workerStalledIntervalMs,
  },
)

worker.on("active", (job) => {
  debugLog("[worker] job active", { id: job.id, data: job.data })
  notifyModerationStarted(job).catch(() => null)
})

worker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed:`, err)
})

worker.on("completed", (job) => {
  debugLog("[worker] job completed", { id: job.id, data: job.data })
})
