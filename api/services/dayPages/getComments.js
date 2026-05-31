const mongoose = require("mongoose")
const getDataWithPages = require("../getDataWithPages")
const DayPage = require("../../models/DayPage")
const { getDayPageCommentsPipeline } = require("../../repositories/index")
const {
  success: { fetched },
  errors: { invalidValue, notFound },
} = require("../../../constants/index")

async function getComments({ dayPageId, loggedUser, page, maxPageSize }) {
  if (!dayPageId || !mongoose.Types.ObjectId.isValid(dayPageId)) return invalidValue("dayPageId")

  const page_ = await DayPage.findOne({ _id: dayPageId, status: "public" })
  if (!page_) return notFound("DayPage")

  const result = await getDataWithPages(
    {
      type: "DayPageComment",
      pipeline: getDayPageCommentsPipeline({
        dayPageId,
        parentCommentId: null,
        mainUser: loggedUser,
      }),
      page,
      maxPageSize,
    },
    loggedUser
  )

  return fetched("Comments", { response: result })
}

module.exports = getComments
