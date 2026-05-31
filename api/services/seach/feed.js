const Followers = require("../../models/Followers")
const getDataWithPages = require("../getDataWithPages")
const { feedDayPagePipeline } = require("../../repositories/index.js")

const {
  success: { fetched },
  maxPageSize: DEFAULT_MAXPAGESIZE,
} = require("../../../constants/index")

const feed = async (props) => {
  const page = Number(props.page) || 1
  const maxPageSize = props.maxPageSize
    ? Number(props.maxPageSize) <= DEFAULT_MAXPAGESIZE
      ? Number(props.maxPageSize)
      : DEFAULT_MAXPAGESIZE
    : DEFAULT_MAXPAGESIZE

  const orderMode = (props.order || "recent").toLowerCase()
  const orderForPaging =
    orderMode === "relevant" || orderMode === "follow_first"
      ? "relevant"
      : "recent"
  const date = typeof props.date === "string" ? props.date.trim() : ""
  const dateStr = /^\d{2}-\d{2}-\d{4}$/.test(date) ? date : null
  const daysWindow = props.days
    ? Math.min(365, Math.max(1, Number(props.days) || 30))
    : 30

  const loggedUser = props.user

  try {
    loggedUser.following = await Followers.countDocuments({
      followerId: loggedUser._id,
    })

    const response = await getDataWithPages(
      {
        type: "User",
        pipeline: feedDayPagePipeline(loggedUser, { dateStr, daysWindow }),
        order: orderForPaging,
        page,
        maxPageSize,
      },
      loggedUser
    )

    return fetched("data", { response })
  } catch (error) {
    console.error(error)
    throw new Error(error.message)
  }
}

module.exports = feed
