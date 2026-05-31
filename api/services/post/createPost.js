const Post = require("../../models/Post")
const Media = require("../../models/Media")
const updateStreak = require("../user/streak/updateStreak")
const deleteFile = require("../../utils/deleteFile")
const { ensurePostMediaPrivacy } = require("../../utils/postMediaPrivacy")
const notifyPostMentions = require("./notifyPostMentions")

const {
  success: { created },
  errors: { serverError },
} = require("../../../constants/index")

function normalizePostPrivacy(privacy) {
  if (typeof privacy !== "string") return privacy
  const normalized = privacy.trim().toLowerCase().replace(/\s+/g, "_")
  return normalized === "close_friends" ? "close friends" : normalized
}

const createPost = async (req) => {
  const { data, emotion, privacy } = req.body
  const loggedUser = req.user
  const normalizedPrivacy = normalizePostPrivacy(privacy)

  const mediaDocs = Array.isArray(req.mediaDocs) ? req.mediaDocs : []

  try {
    let allMediaPublic = true
    let mediaStatuses = mediaDocs.map((m) => m.status)

    if (mediaDocs.length) {
      const freshMedia = await Media.find({
        _id: { $in: mediaDocs.map((m) => m._id) },
      }).select("status")

      mediaStatuses = freshMedia.map((m) => m.status)
      allMediaPublic = freshMedia.every((m) => m.status === "public")
    }

    const postStatus = allMediaPublic ? "public" : "pending"

    const post = await Post.create({
      date: new Date(),
      data,
      emotion,
      privacy: normalizedPrivacy,
      status: postStatus,
      media: mediaDocs.map((m) => m._id),
      user: loggedUser._id,
      created_at: new Date(),
    })

    if (postStatus !== "public") {
      await Post.updateOne(
        { _id: post._id, status: "public" },
        { $set: { status: "pending" } }
      )
    }

    if (mediaDocs.length) {
      await Promise.allSettled(
        mediaDocs.map((media) =>
          Media.findByIdAndUpdate(media._id, {
            usedIn: { model: "Post", refId: post._id },
          }),
        ),
      )

      const publicMedias = await Media.find({
        _id: { $in: mediaDocs.map((m) => m._id) },
        status: "public",
      })
      await ensurePostMediaPrivacy({ post, medias: publicMedias })
    }

    // Recalculate post status after media linkage (worker may have finished early)
    if (mediaDocs.length) {
      const finalMedia = await Media.find({
        _id: { $in: mediaDocs.map((m) => m._id) },
      }).select("status")

      const hasRejected = finalMedia.some((m) => m.status === "rejected")
      const allPublic =
        finalMedia.length > 0 && finalMedia.every((m) => m.status === "public")

      const finalStatus = hasRejected
        ? "rejected"
        : allPublic
        ? "public"
        : "pending"

      if (finalStatus !== post.status) {
        await Post.updateOne({ _id: post._id }, { $set: { status: finalStatus } })
      }

    }

    await notifyPostMentions({
      postId: post._id,
      actorId: loggedUser._id,
      actorUsername: loggedUser.username,
      nextText: post.data,
      prevText: "",
    })

    await updateStreak(loggedUser._id, loggedUser?.timeZone)

    return created("post", { post })
  } catch (error) {
    for (let mediaDoc of mediaDocs) {
      await deleteFile({ key: mediaDoc.key }).catch(() => null)
    }
    console.error("Error creating post:", error)
    return serverError(error)
  }
}

module.exports = createPost
