const mongoose = require("mongoose")
const axios = require("axios")
const DayPage = require("../../models/DayPage")
const DayPageComment = require("../../models/DayPageComment")
const { createNotificationWithLimits } = require("../notification/createNotification")
const {
  giphy: { apiKey },
} = require("../../../config")
const {
  dayPage: { maxCommentLength },
  errors: { notFound, invalidValue, fieldNotFilledIn, inputTooLong },
  errorGif,
  success: { created },
} = require("../../../constants/index")

async function commentDayPage({ dayPageId, comment, gif, parentCommentId, loggedUser }) {
  if (!comment) return fieldNotFilledIn("comment")
  if (comment.length > maxCommentLength) return inputTooLong("Comment")
  if (!dayPageId || !mongoose.Types.ObjectId.isValid(dayPageId)) return invalidValue("dayPageId")

  const page = await DayPage.findOne({ _id: dayPageId, status: "public" })
  if (!page) return notFound("DayPage")

  let parentComment = null
  if (parentCommentId) {
    if (!mongoose.Types.ObjectId.isValid(parentCommentId)) return invalidValue("parentCommentId")
    parentComment = await DayPageComment.findOne({
      _id: parentCommentId,
      dayPageId: page._id,
      status: { $ne: "deleted" },
    })
    if (!parentComment) return notFound("Comment")
  }

  let resolvedGif = null
  if (gif) {
    try {
      const res = await axios.get(`https://api.giphy.com/v1/gifs/${gif}?api_key=${apiKey}`)
      resolvedGif = {
        title: res.data.data.title,
        id: res.data.data.id,
        url: res.data.data.images.original.url,
      }
    } catch {
      resolvedGif = errorGif
    }
  }

  const newComment = await DayPageComment.create({
    userId: loggedUser._id,
    dayPageUserId: page.user,
    dayPageId: page._id,
    parentCommentId: parentComment?._id || null,
    comment,
    gif: resolvedGif,
  })

  if (String(page.user) !== String(loggedUser._id)) {
    await createNotificationWithLimits({
      userId: page.user,
      type: "daypage_comment",
      title: "New comment",
      body: `@${loggedUser.username} commented on your day.`,
      data: {
        actorId: loggedUser._id,
        actorUsername: loggedUser.username,
        targetId: page._id,
        dayPageId: page._id,
        commentId: newComment._id,
      },
      actorId: loggedUser._id,
      targetId: page._id,
      debounceMs: 30 * 1000,
      maxPerWindow: 60,
      windowMs: 60 * 60 * 1000,
    }).catch(() => null)
  }

  if (parentComment && String(parentComment.userId) !== String(loggedUser._id)) {
    await createNotificationWithLimits({
      userId: parentComment.userId,
      type: "daypage_comment_reply",
      title: "New reply",
      body: `@${loggedUser.username} replied to your comment.`,
      data: {
        actorId: loggedUser._id,
        actorUsername: loggedUser.username,
        targetId: parentComment._id,
        dayPageId: page._id,
        commentId: newComment._id,
        parentCommentId: parentComment._id,
      },
      actorId: loggedUser._id,
      targetId: parentComment._id,
      debounceMs: 30 * 1000,
      maxPerWindow: 60,
      windowMs: 60 * 60 * 1000,
    }).catch(() => null)
  }

  return created("Comment", { data: { comment: newComment } })
}

module.exports = commentDayPage
