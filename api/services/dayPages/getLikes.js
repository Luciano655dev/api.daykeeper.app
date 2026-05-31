const mongoose = require("mongoose")
const { Types } = require("mongoose")
const getDataWithPages = require("../getDataWithPages")
const DayPage = require("../../models/DayPage")
const hideUserData = require("../../repositories/hideProject/hideUserData")
const {
  success: { fetched },
  errors: { invalidValue, notFound },
} = require("../../../constants/index")

async function getLikes({ dayPageId, loggedUser, page, maxPageSize }) {
  if (!dayPageId || !mongoose.Types.ObjectId.isValid(dayPageId)) return invalidValue("dayPageId")

  const page_ = await DayPage.findOne({ _id: dayPageId, status: "public" })
  if (!page_) return notFound("DayPage")

  const pipeline = [
    {
      $match: {
        dayPageId: new Types.ObjectId(String(dayPageId)),
        status: { $ne: "deleted" },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        pipeline: [{ $project: hideUserData }],
        as: "_userInfo",
      },
    },
    { $unwind: "$_userInfo" },
    {
      $project: {
        _id: 1,
        dayPageId: 1,
        created_at: 1,
        user: "$_userInfo",
      },
    },
  ]

  const result = await getDataWithPages(
    {
      type: "DayPageLike",
      pipeline,
      page,
      maxPageSize,
    },
    loggedUser
  )

  return fetched("Likes", { response: result })
}

module.exports = getLikes
