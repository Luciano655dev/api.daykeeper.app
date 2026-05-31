const mongoose = require("mongoose")
const DayPageComment = require("../../models/DayPageComment")
const {
  success: { deleted },
  errors: { invalidValue, notFound, unauthorized },
} = require("../../../constants/index")

async function deleteComment({ commentId, loggedUser }) {
  if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) return invalidValue("commentId")

  const comment = await DayPageComment.findOne({
    _id: commentId,
    status: { $ne: "deleted" },
  })
  if (!comment) return notFound("Comment")

  const isCommentOwner = String(comment.userId) === String(loggedUser._id)
  const isPageOwner = String(comment.dayPageUserId) === String(loggedUser._id)

  if (!isCommentOwner && !isPageOwner) return unauthorized("delete this comment")

  comment.status = "deleted"
  comment.deletedAt = new Date()
  await comment.save()

  return deleted("Comment", {})
}

module.exports = deleteComment
