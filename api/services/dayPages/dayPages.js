const mongoose = require("mongoose")
const sanitizeHtml = require("sanitize-html")
const { formatInTimeZone } = require("date-fns-tz")
const User = require("../../models/User")
const DayPage = require("../../models/DayPage")
const Media = require("../../models/Media")
const { getDayRangeDDMMYYYY } = require("../../utils/dayRange")
const { serializeMediaPayload } = require("../../utils/serializeMediaPayload")
const updateStreak = require("../user/streak/updateStreak")
const {
  success: { fetched, created, updated, deleted },
  errors: { notFound, invalidValue, fieldsNotFilledIn, serverError },
  dayPage: {
    maxBlocksPerPage,
    maxTextBlockLength,
    maxTaskTitleLength,
    maxEventTitleLength,
    maxEventDescriptionLength,
  },
  user: { defaultTimeZone },
} = require("../../../constants/index")
const { getDayPagePipeline } = require("../../repositories/index")

// ---- helpers ----

function resolveDateKey(dateStr, tz) {
  const range = getDayRangeDDMMYYYY(dateStr, tz)
  if (!range) return null
  // Format the UTC start back into the user's local YYYY-MM-DD
  return { dateKey: formatInTimeZone(range.start, tz, "yyyy-MM-dd"), date: range.start }
}

const ALLOWED_PRIVACIES = new Set(["public", "private", "close friends"])
const BLOCK_TYPES = new Set(["text", "task", "event", "image"])

const ALLOWED_HTML_OPTIONS = {
  allowedTags: [
    "p", "br", "strong", "b", "em", "i", "u", "s", "del", "strike",
    "code", "pre", "h1", "h2", "h3", "ul", "ol", "li", "blockquote",
  ],
  allowedAttributes: {},
  disallowedTagsMode: "discard",
}

function sanitizeBlock(raw, idx) {
  if (!raw || typeof raw !== "object") return null
  const type = raw.type
  if (!BLOCK_TYPES.has(type)) return null

  const block = {
    type,
    order: typeof raw.order === "number" ? raw.order : idx,
  }

  if (type === "text") {
    if (typeof raw.content !== "string") return null
    const sanitized = sanitizeHtml(raw.content, ALLOWED_HTML_OPTIONS)
    if (!sanitized.replace(/<[^>]*>/g, "").trim()) return null
    block.content = sanitized.slice(0, maxTextBlockLength)
  }

  if (type === "task") {
    if (typeof raw.title !== "string" || !raw.title.trim()) return null
    block.title = raw.title.trim().slice(0, maxTaskTitleLength)
    block.completed = raw.completed === true
    if (raw._id && mongoose.Types.ObjectId.isValid(raw._id)) {
      block._id = raw._id
    }
  }

  if (type === "event") {
    if (typeof raw.title !== "string" || !raw.title.trim()) return null
    block.title = raw.title.trim().slice(0, maxEventTitleLength)
    block.description = typeof raw.description === "string"
      ? raw.description.trim().slice(0, maxEventDescriptionLength)
      : ""
    if (raw.dateStart) block.dateStart = new Date(raw.dateStart)
    if (raw.dateEnd) block.dateEnd = new Date(raw.dateEnd)
    if (raw._id && mongoose.Types.ObjectId.isValid(raw._id)) {
      block._id = raw._id
    }
  }

  if (type === "image") {
    if (!raw.mediaId || !mongoose.Types.ObjectId.isValid(raw.mediaId)) return null
    block.mediaId = raw.mediaId
    if (raw._id && mongoose.Types.ObjectId.isValid(raw._id)) {
      block._id = raw._id
    }
  }

  return block
}

// Populate the `media` field on image blocks so serializeMediaPayload can
// build URLs. getDayPagePipeline does this via $lookup; we do it here for
// the write paths (getOrInit, upsert, addImageBlock).
async function populateBlocksMedia(pageObj) {
  const blocks = pageObj.blocks ?? []
  const imageBlocks = blocks.filter((b) => b.type === "image" && b.mediaId)
  if (imageBlocks.length === 0) return pageObj

  const mediaIds = imageBlocks.map((b) => b.mediaId)
  const mediaList = await Media.find(
    { _id: { $in: mediaIds } },
    { _id: 1, key: 1, type: 1, status: 1 },
  ).lean()
  const mediaMap = new Map(mediaList.map((m) => [m._id.toString(), m]))

  return {
    ...pageObj,
    blocks: blocks.map((block) => {
      if (block.type !== "image" || !block.mediaId) return block
      const media = mediaMap.get(block.mediaId.toString())
      return media ? { ...block, media } : block
    }),
  }
}

// ---- service functions ----

async function getOrInitDayPage({ dateStr, loggedUser }) {
  const tz = loggedUser?.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")

  const page = await DayPage.findOne({
    user: loggedUser._id,
    dateKey: resolved.dateKey,
    status: { $ne: "deleted" },
  })

  if (!page) {
    return fetched("DayPage", {
      data: {
        user: loggedUser._id,
        dateKey: resolved.dateKey,
        date: resolved.date,
        privacy: "public",
        blocks: [],
        status: "public",
      },
    })
  }

  const populated = await populateBlocksMedia(page.toObject())
  return fetched("DayPage", { data: serializeMediaPayload(populated) })
}

async function upsertDayPage({ dateStr, privacy, blocks, loggedUser }) {
  const tz = loggedUser?.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")

  const normalizedPrivacy = ALLOWED_PRIVACIES.has(privacy) ? privacy : "public"

  const rawBlocks = Array.isArray(blocks) ? blocks : []
  const sanitizedBlocks = rawBlocks
    .slice(0, maxBlocksPerPage)
    .map(sanitizeBlock)
    .filter(Boolean)

  const now = new Date()

  const existing = await DayPage.findOne({
    user: loggedUser._id,
    dateKey: resolved.dateKey,
    status: { $ne: "deleted" },
  })

  const isNew = !existing

  const page = await DayPage.findOneAndUpdate(
    { user: loggedUser._id, dateKey: resolved.dateKey },
    {
      $set: {
        date: resolved.date,
        privacy: normalizedPrivacy,
        blocks: sanitizedBlocks,
        status: "public",
        updated_at: now,
      },
      $setOnInsert: { created_at: now },
    },
    { upsert: true, new: true },
  )

  if (isNew) {
    await updateStreak(loggedUser._id, tz).catch(() => null)
  }

  const populated = await populateBlocksMedia(page.toObject())
  return created("DayPage", { data: serializeMediaPayload(populated) })
}

async function updateBlock({ dateStr, blockId, update, loggedUser }) {
  const tz = loggedUser?.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")
  if (!blockId || !mongoose.Types.ObjectId.isValid(blockId)) return invalidValue("blockId")

  const ALLOWED_BLOCK_UPDATES = new Set(["completed", "title", "content", "order"])
  const safeUpdate = {}
  for (const [k, v] of Object.entries(update || {})) {
    if (ALLOWED_BLOCK_UPDATES.has(k)) safeUpdate[`blocks.$[elem].${k}`] = v
  }
  safeUpdate["blocks.$[elem].updated_at"] = new Date()

  if (Object.keys(safeUpdate).length === 1) return invalidValue("update fields")

  const page = await DayPage.findOneAndUpdate(
    {
      user: loggedUser._id,
      dateKey: resolved.dateKey,
      status: { $ne: "deleted" },
    },
    { $set: safeUpdate },
    {
      arrayFilters: [{ "elem._id": new mongoose.Types.ObjectId(blockId) }],
      new: true,
    },
  )

  if (!page) return notFound("DayPage")
  return updated("Block", { data: serializeMediaPayload(page.toObject()) })
}

async function deleteDayPage({ dateStr, loggedUser }) {
  const tz = loggedUser?.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")

  const page = await DayPage.findOneAndUpdate(
    {
      user: loggedUser._id,
      dateKey: resolved.dateKey,
      status: { $ne: "deleted" },
    },
    { $set: { status: "deleted", deletedAt: new Date() } },
    { new: true },
  )

  if (!page) return notFound("DayPage")
  return deleted("DayPage", {})
}

async function getUserDayPage({ username, dateStr, loggedUser }) {
  const targetUser = await User.findOne({ username, status: "public", banned: { $ne: true } })
  if (!targetUser) return notFound("User")

  const tz = targetUser.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")

  const pipeline = getDayPagePipeline({
    userId: targetUser._id,
    dateKey: resolved.dateKey,
    loggedUser,
  })

  const result = await DayPage.aggregate(pipeline)
  if (!result[0]) return notFound("DayPage")

  return fetched("DayPage", { data: serializeMediaPayload(result[0]) })
}

async function addImageBlock({ dateStr, mediaId, loggedUser }) {
  const tz = loggedUser?.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")
  if (!mediaId || !mongoose.Types.ObjectId.isValid(String(mediaId))) return invalidValue("mediaId")

  const now = new Date()
  const existing = await DayPage.findOne({
    user: loggedUser._id,
    dateKey: resolved.dateKey,
    status: { $ne: "deleted" },
  })

  const isNew = !existing
  const nextOrder = existing?.blocks?.length ?? 0

  const page = await DayPage.findOneAndUpdate(
    { user: loggedUser._id, dateKey: resolved.dateKey },
    {
      $push: {
        blocks: {
          type: "image",
          mediaId: new mongoose.Types.ObjectId(String(mediaId)),
          order: nextOrder,
          created_at: now,
        },
      },
      $set: { date: resolved.date, status: "public", updated_at: now },
      $setOnInsert: { created_at: now, privacy: "public" },
    },
    { upsert: true, new: true },
  )

  if (isNew) {
    await updateStreak(loggedUser._id, tz).catch(() => null)
  }

  await Media.findByIdAndUpdate(mediaId, {
    usedIn: { model: "DayPage", refId: page._id },
  }).catch(() => null)

  const populated = await populateBlocksMedia(page.toObject())
  return created("DayPage", { data: serializeMediaPayload(populated) })
}

const MAX_MEDIA_BLOCKS = 5

async function addMediaBlocks({ dateStr, mediaIds, loggedUser }) {
  const tz = loggedUser?.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")

  const validIds = (Array.isArray(mediaIds) ? mediaIds : [])
    .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)))
    .map((id) => new mongoose.Types.ObjectId(String(id)))

  if (validIds.length === 0) return invalidValue("mediaIds")

  const now = new Date()
  const existing = await DayPage.findOne({
    user: loggedUser._id,
    dateKey: resolved.dateKey,
    status: { $ne: "deleted" },
  })

  const isNew = !existing
  const currentImageCount = existing?.blocks?.filter((b) => b.type === "image").length ?? 0
  const toAdd = validIds.slice(0, Math.max(0, MAX_MEDIA_BLOCKS - currentImageCount))

  if (toAdd.length === 0) return invalidValue("maxImages")

  const nextOrder = existing?.blocks?.length ?? 0
  const newBlocks = toAdd.map((mediaId, i) => ({
    type: "image",
    mediaId,
    order: nextOrder + i,
    created_at: now,
  }))

  const page = await DayPage.findOneAndUpdate(
    { user: loggedUser._id, dateKey: resolved.dateKey },
    {
      $push: { blocks: { $each: newBlocks } },
      $set: { date: resolved.date, status: "public", updated_at: now },
      $setOnInsert: { created_at: now, privacy: "public" },
    },
    { upsert: true, new: true },
  )

  if (isNew) {
    await updateStreak(loggedUser._id, tz).catch(() => null)
  }

  await Promise.all(
    toAdd.map((mediaId) =>
      Media.findByIdAndUpdate(mediaId, {
        usedIn: { model: "DayPage", refId: page._id },
      }).catch(() => null),
    ),
  )

  const populated = await populateBlocksMedia(page.toObject())
  return created("DayPage", { data: serializeMediaPayload(populated) })
}

module.exports = {
  getOrInitDayPage,
  upsertDayPage,
  updateBlock,
  deleteDayPage,
  getUserDayPage,
  addImageBlock,
  addMediaBlocks,
}
