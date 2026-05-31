/**
 * Migration: Posts / Tasks / Events / Likes / Comments → DayPage blocks
 *
 * Usage (dry-run by default):
 *   node scripts/migrateToDayPage.js
 *
 * Apply changes:
 *   node scripts/migrateToDayPage.js --apply
 *
 * Options:
 *   --apply           Write to DB (default: dry-run)
 *   --batch=N         Documents per batch (default: 200)
 *   --skip-posts      Skip Post migration
 *   --skip-tasks      Skip DayTask migration
 *   --skip-events     Skip DayEvent migration
 *   --skip-likes      Skip PostLike → DayPageLike migration
 *   --skip-comments   Skip PostComment → DayPageComment migration
 */

require("dotenv").config()

const mongoose = require("mongoose")

// ── Inline models (avoid importing app bootstrap) ────────────────────────────

const Post = require("../api/models/Post")
const DayTask = require("../api/models/DayTask")
const DayEvent = require("../api/models/DayEvent")
const DayPage = require("../api/models/DayPage")
const PostLikes = require("../api/models/PostLikes")
const PostComments = require("../api/models/PostComments")
const DayPageLike = require("../api/models/DayPageLike")
const DayPageComment = require("../api/models/DayPageComment")

// Lightweight log model for idempotency —
// stored in "migrationLogs" collection, auto-created on first write
const migrationLogSchema = new mongoose.Schema({
  script: { type: String, required: true },
  collection: { type: String, required: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  dayPageId: { type: mongoose.Schema.Types.ObjectId, default: null },
  migratedAt: { type: Date, default: Date.now },
})
migrationLogSchema.index({ script: 1, collection: 1, sourceId: 1 }, { unique: true })
const MigLog = mongoose.model("MigrationLog", migrationLogSchema, "migrationLogs")

// ── Helpers ──────────────────────────────────────────────────────────────────

const SCRIPT = "migrateToDayPage"

function dateToKey(d) {
  if (!d) return null
  const dt = new Date(d)
  if (isNaN(dt)) return null
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const day = String(dt.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function utcStartOfDay(d) {
  const dt = new Date(d)
  dt.setUTCHours(0, 0, 0, 0)
  return dt
}

function plainTextToHtml(text) {
  if (!text) return ""
  return text
    .split("\n")
    .map((line) => `<p>${line || "<br>"}</p>`)
    .join("")
}

/** Returns true if sourceId is already logged (already migrated). */
async function isLogged(collection, sourceId) {
  return !!(await MigLog.findOne({ script: SCRIPT, collection, sourceId }))
}

async function logDone(collection, sourceId, dayPageId, apply) {
  if (!apply) return
  try {
    await MigLog.updateOne(
      { script: SCRIPT, collection, sourceId },
      { $set: { dayPageId, migratedAt: new Date() } },
      { upsert: true },
    )
  } catch (_) {
    // duplicate key on race — safe to ignore
  }
}

/**
 * Find or create a DayPage for user+dateKey.
 * In dry-run mode returns a synthetic object without writing.
 */
async function upsertDayPage(userId, dateKey, date, privacy, apply) {
  if (!apply) {
    return { _id: new mongoose.Types.ObjectId(), blocks: [] }
  }
  return DayPage.findOneAndUpdate(
    { user: userId, dateKey },
    {
      $setOnInsert: {
        user: userId,
        dateKey,
        date: utcStartOfDay(date),
        privacy: privacy || "public",
        status: "public",
        created_at: new Date(),
        updated_at: new Date(),
      },
    },
    { upsert: true, new: true },
  )
}

async function appendBlock(dayPageId, block, apply) {
  if (!apply) return
  await DayPage.updateOne(
    { _id: dayPageId },
    {
      $push: { blocks: block },
      $set: { updated_at: new Date() },
    },
  )
}

// ── Migration phases ─────────────────────────────────────────────────────────

async function migratePosts({ apply, batch }) {
  const col = "posts"
  let migrated = 0, skipped = 0, failed = 0
  let lastId = null

  console.log("\n[posts] Starting…")

  while (true) {
    const query = { status: { $ne: "deleted" } }
    if (lastId) query._id = { $gt: lastId }
    const posts = await Post.find(query).sort({ _id: 1 }).limit(batch).lean()
    if (!posts.length) break

    for (const post of posts) {
      lastId = post._id

      if (await isLogged(col, post._id)) {
        skipped++
        continue
      }

      const dateKey = dateToKey(post.date || post.created_at)
      if (!dateKey) { failed++; continue }

      try {
        const page = await upsertDayPage(
          post.user,
          dateKey,
          post.date || post.created_at,
          post.privacy,
          apply,
        )

        // Existing blocks to compute next order
        const nextOrder = (page.blocks?.length ?? 0)
        let orderOffset = 0

        // Text block
        if (post.data?.trim()) {
          const textBlock = {
            type: "text",
            content: plainTextToHtml(post.data),
            order: nextOrder + orderOffset++,
            created_at: post.created_at || new Date(),
            updated_at: post.created_at || new Date(),
          }
          await appendBlock(page._id, textBlock, apply)
        }

        // Image blocks (one per media ref)
        if (Array.isArray(post.media) && post.media.length) {
          for (const mediaId of post.media) {
            const imgBlock = {
              type: "image",
              mediaId,
              order: nextOrder + orderOffset++,
              created_at: post.created_at || new Date(),
              updated_at: post.created_at || new Date(),
            }
            await appendBlock(page._id, imgBlock, apply)
          }
        }

        await logDone(col, post._id, page._id, apply)
        migrated++
      } catch (err) {
        console.error(`  [posts] Error on ${post._id}:`, err.message)
        failed++
      }
    }

    if (posts.length < batch) break
  }

  console.log(`[posts] migrated=${migrated} skipped=${skipped} failed=${failed}`)
  return { migrated, skipped, failed }
}

async function migrateTasks({ apply, batch }) {
  const col = "dayTask"
  let migrated = 0, skipped = 0, failed = 0
  let lastId = null

  console.log("\n[tasks] Starting…")

  while (true) {
    const query = { status: { $ne: "deleted" }, daily: { $ne: true } }
    if (lastId) query._id = { $gt: lastId }
    const tasks = await DayTask.find(query).sort({ _id: 1 }).limit(batch).lean()
    if (!tasks.length) break

    for (const task of tasks) {
      lastId = task._id

      if (await isLogged(col, task._id)) {
        skipped++
        continue
      }

      const dateKey = dateToKey(task.date || task.createdAt)
      if (!dateKey) { failed++; continue }

      try {
        const page = await upsertDayPage(
          task.user,
          dateKey,
          task.date || task.createdAt,
          task.privacy,
          apply,
        )

        const block = {
          type: "task",
          title: task.title,
          completed: task.completed ?? false,
          order: page.blocks?.length ?? 0,
          created_at: task.createdAt || new Date(),
          updated_at: task.updatedAt || new Date(),
        }
        await appendBlock(page._id, block, apply)
        await logDone(col, task._id, page._id, apply)
        migrated++
      } catch (err) {
        console.error(`  [tasks] Error on ${task._id}:`, err.message)
        failed++
      }
    }

    if (tasks.length < batch) break
  }

  console.log(`[tasks] migrated=${migrated} skipped=${skipped} failed=${failed}`)
  return { migrated, skipped, failed }
}

async function migrateEvents({ apply, batch }) {
  const col = "dayEvent"
  let migrated = 0, skipped = 0, failed = 0
  let lastId = null

  console.log("\n[events] Starting…")

  while (true) {
    const query = { status: { $ne: "deleted" } }
    if (lastId) query._id = { $gt: lastId }
    const events = await DayEvent.find(query).sort({ _id: 1 }).limit(batch).lean()
    if (!events.length) break

    for (const ev of events) {
      lastId = ev._id

      if (await isLogged(col, ev._id)) {
        skipped++
        continue
      }

      const dateKey = dateToKey(ev.dateStart || ev.createdAt)
      if (!dateKey) { failed++; continue }

      try {
        const page = await upsertDayPage(
          ev.user,
          dateKey,
          ev.dateStart || ev.createdAt,
          ev.privacy,
          apply,
        )

        const block = {
          type: "event",
          title: ev.title,
          description: ev.description || "",
          dateStart: ev.dateStart,
          dateEnd: ev.dateEnd,
          order: page.blocks?.length ?? 0,
          created_at: ev.createdAt || new Date(),
          updated_at: ev.updatedAt || new Date(),
        }
        await appendBlock(page._id, block, apply)
        await logDone(col, ev._id, page._id, apply)
        migrated++
      } catch (err) {
        console.error(`  [events] Error on ${ev._id}:`, err.message)
        failed++
      }
    }

    if (events.length < batch) break
  }

  console.log(`[events] migrated=${migrated} skipped=${skipped} failed=${failed}`)
  return { migrated, skipped, failed }
}

/**
 * Build a sourceId → dayPageId lookup from MigrationLog for posts.
 * Used by likes/comments so we know which DayPage a post mapped to.
 */
async function buildPostPageMap(postIds) {
  const logs = await MigLog.find({
    script: SCRIPT,
    collection: "posts",
    sourceId: { $in: postIds },
  }).lean()
  const map = new Map()
  for (const log of logs) {
    if (log.dayPageId) map.set(String(log.sourceId), log.dayPageId)
  }
  return map
}

async function migrateLikes({ apply, batch }) {
  const col = "postLikes"
  let migrated = 0, skipped = 0, failed = 0
  let lastId = null

  console.log("\n[likes] Starting…")

  while (true) {
    const query = { status: { $ne: "deleted" } }
    if (lastId) query._id = { $gt: lastId }
    const likes = await PostLikes.find(query).sort({ _id: 1 }).limit(batch).lean()
    if (!likes.length) break

    const postIds = [...new Set(likes.map((l) => l.postId).filter(Boolean))]
    const postPageMap = await buildPostPageMap(postIds)

    for (const like of likes) {
      lastId = like._id

      if (await isLogged(col, like._id)) {
        skipped++
        continue
      }

      const dayPageId = postPageMap.get(String(like.postId))
      if (!dayPageId) {
        // Post not yet migrated or had no dateKey — skip silently
        skipped++
        continue
      }

      try {
        if (apply) {
          await DayPageLike.updateOne(
            { userId: like.userId, dayPageId },
            {
              $setOnInsert: {
                userId: like.userId,
                dayPageUserId: like.userPostId,
                dayPageId,
                status: "public",
                created_at: new Date(),
              },
            },
            { upsert: true },
          ).catch(() => null) // ignore duplicate key
        }
        await logDone(col, like._id, dayPageId, apply)
        migrated++
      } catch (err) {
        console.error(`  [likes] Error on ${like._id}:`, err.message)
        failed++
      }
    }

    if (likes.length < batch) break
  }

  console.log(`[likes] migrated=${migrated} skipped=${skipped} failed=${failed}`)
  return { migrated, skipped, failed }
}

async function migrateComments({ apply, batch }) {
  const col = "postComments"
  let migrated = 0, skipped = 0, failed = 0
  let lastId = null

  console.log("\n[comments] Starting…")

  while (true) {
    const query = { status: { $ne: "deleted" } }
    if (lastId) query._id = { $gt: lastId }
    const comments = await PostComments.find(query).sort({ _id: 1 }).limit(batch).lean()
    if (!comments.length) break

    const postIds = [...new Set(comments.map((c) => c.postId).filter(Boolean))]
    const postPageMap = await buildPostPageMap(postIds)

    // Build a map of old comment _id → new DayPageComment _id for parent threading
    const parentMap = new Map()

    for (const comment of comments) {
      lastId = comment._id

      if (await isLogged(col, comment._id)) {
        skipped++
        continue
      }

      const dayPageId = postPageMap.get(String(comment.postId))
      if (!dayPageId) {
        skipped++
        continue
      }

      try {
        let newCommentId = null
        if (apply) {
          const parentLog = comment.parentCommentId
            ? await MigLog.findOne({ script: SCRIPT, collection: col, sourceId: comment.parentCommentId }).lean()
            : null

          const newComment = await DayPageComment.create({
            userId: comment.userId,
            dayPageUserId: comment.userPostId,
            dayPageId,
            parentCommentId: parentLog ? parentLog.dayPageId : null,
            comment: comment.comment || "",
            gif: comment.gif,
            status: "public",
            created_at: comment.created_at || new Date(),
          })
          newCommentId = newComment._id
          parentMap.set(String(comment._id), newCommentId)
        }

        await logDone(col, comment._id, newCommentId || dayPageId, apply)
        migrated++
      } catch (err) {
        console.error(`  [comments] Error on ${comment._id}:`, err.message)
        failed++
      }
    }

    if (comments.length < batch) break
  }

  console.log(`[comments] migrated=${migrated} skipped=${skipped} failed=${failed}`)
  return { migrated, skipped, failed }
}

// ── Entry point ──────────────────────────────────────────────────────────────

function hasFlag(flag) { return process.argv.includes(flag) }
function getArg(name, fallback) {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : fallback
}

async function run() {
  const apply = hasFlag("--apply")
  const batch = Number(getArg("batch", "200")) || 200
  const skipPosts = hasFlag("--skip-posts")
  const skipTasks = hasFlag("--skip-tasks")
  const skipEvents = hasFlag("--skip-events")
  const skipLikes = hasFlag("--skip-likes")
  const skipComments = hasFlag("--skip-comments")

  if (!process.env.MONGODB_URI) {
    console.error("Error: MONGODB_URI is not set in environment")
    process.exit(1)
  }

  console.log(`\n${"=".repeat(60)}`)
  console.log(`  DayPage Migration`)
  console.log(`  mode   : ${apply ? "APPLY (writes to DB)" : "DRY RUN (no writes)"}`)
  console.log(`  batch  : ${batch}`)
  console.log(`${"=".repeat(60)}\n`)

  if (!apply) {
    console.log("  Running in DRY-RUN mode. Pass --apply to write.\n")
  }

  await mongoose.connect(process.env.MONGODB_URI)
  console.log("Connected to MongoDB.\n")

  const totals = { migrated: 0, skipped: 0, failed: 0 }
  const add = (r) => {
    totals.migrated += r.migrated
    totals.skipped += r.skipped
    totals.failed += r.failed
  }

  if (!skipPosts) add(await migratePosts({ apply, batch }))
  if (!skipTasks) add(await migrateTasks({ apply, batch }))
  if (!skipEvents) add(await migrateEvents({ apply, batch }))
  if (!skipLikes) add(await migrateLikes({ apply, batch }))
  if (!skipComments) add(await migrateComments({ apply, batch }))

  console.log(`\n${"=".repeat(60)}`)
  console.log("  Summary")
  console.table(totals)
  console.log(`${"=".repeat(60)}\n`)

  await mongoose.disconnect()
}

run().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
