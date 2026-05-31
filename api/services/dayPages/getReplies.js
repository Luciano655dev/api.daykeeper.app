const mongoose = require("mongoose")
const getDataWithPages = require("../getDataWithPages")
const DayPageComment = require("../../models/DayPageComment")
const { getDayPageCommentsPipeline } = require("../../repositories/index")
const {
  success: { fetched },
  errors: { invalidValue, notFound },
} = require("../../../constants/index")

async function getReplies({ commentId, loggedUser, page, maxPageSize }) {
  if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) return invalidValue("commentId")

  const comment = await DayPageComment.findOne({
    _id: commentId,
    status: { $ne: "deleted" },
  })
  if (!comment) return notFound("Comment")

  const result = await getDataWithPages(
    {
      type: "DayPageComment",
      pipeline: getDayPageCommentsPipeline({
        dayPageId: comment.dayPageId,
        parentCommentId: commentId,
        mainUser: loggedUser,
      }),
      page,
      maxPageSize,
    },
    loggedUser
  )

  return fetched("Replies", { response: result })
}

module.exports = getReplies
