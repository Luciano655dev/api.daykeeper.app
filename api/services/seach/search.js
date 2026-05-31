const Followers = require("../../models/Followers")
const getDataWithPages = require("../getDataWithPages")
const {
  searchUserPipeline,
  searchDayPagePipeline,
} = require("../../repositories")

const {
  maxPageSize: DEFAULT_MAX_PAGE_SIZE,
  success: { fetched },
} = require("../../../constants/index")

function normalizeSearchType(input) {
  const t = String(input || "")
    .trim()
    .toLowerCase()

  if (t === "user" || t === "users") return "User"
  if (t === "daypage" || t === "day_page" || t === "page") return "DayPage"
  return "DayPage"
}

const search = async (props) => {
  const page = Number(props.page) || 1
  const maxPageSize = props.maxPageSize
    ? Number(props.maxPageSize) <= DEFAULT_MAX_PAGE_SIZE
      ? Number(props.maxPageSize)
      : DEFAULT_MAX_PAGE_SIZE
    : DEFAULT_MAX_PAGE_SIZE

  const searchQuery = props.q || ""
  const order = props.order || "relevant"
  const following = props.following
  const type = normalizeSearchType(props?.type)

  const loggedUser = props.user

  try {
    loggedUser.following = await Followers.countDocuments({
      followerId: loggedUser._id,
    })

    const pipeline =
      type === "User"
        ? searchUserPipeline(searchQuery, loggedUser)
        : searchDayPagePipeline(searchQuery, loggedUser)

    const response = await getDataWithPages(
      {
        type,
        pipeline,
        order,
        following,
        page,
        maxPageSize,
      },
      loggedUser
    )

    return fetched(`data`, { response })
  } catch (error) {
    console.error(error)
    throw new Error(error.message)
  }
}

module.exports = search
