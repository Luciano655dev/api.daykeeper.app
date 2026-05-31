const { Types } = require("mongoose")
const { serializeMediaPayload } = require("../utils/serializeMediaPayload")

const { maxPageSize: DEFAULT_MAX_PAGE_SIZE } = require("../../constants/index")

function toObjectIdOrNull(id) {
  try {
    if (!id) return null
    if (id instanceof Types.ObjectId) return id
    if (Types.ObjectId.isValid(id)) return new Types.ObjectId(id)
    return null
  } catch {
    return null
  }
}

const DEFAULT_MODEL = "Post"
const MODEL_BY_TYPE = {
  Post: require("../models/Post"),
  User: require("../models/User"),
  Follower: require("../models/Followers"),
  CloseFriend: require("../models/CloseFriends"),
  Block: require("../models/Blocks"),
  PostLikes: require("../models/PostLikes"),
  PostComments: require("../models/PostComments"),
  CommentLikes: require("../models/CommentLikes"),
  Report: require("../models/Report"),
  BanHistory: require("../models/BanHistory"),
  Task: require("../models/DayTask"),
  Event: require("../models/DayEvent"),
  Notification: require("../models/Notification"),
  DayPageComment: require("../models/DayPageComment"),
  DayPageLike: require("../models/DayPageLike"),
  DayPage: require("../models/DayPage"),
}

const getDataWithPages = async (
  { type, pipeline = [], order = "recent", following, page = 1, maxPageSize },
  mainUser
) => {
  // ---------- sanitize paging ----------
  let p = Number(page)
  let size = Number(maxPageSize)

  if (!Number.isFinite(p) || p < 1) p = 1
  if (!Number.isFinite(size) || size < 1) size = DEFAULT_MAX_PAGE_SIZE
  size = Math.min(size, DEFAULT_MAX_PAGE_SIZE)

  const skipCount = (p - 1) * size
  const mainUserId = toObjectIdOrNull(mainUser?._id)
  const basePipeline = Array.isArray(pipeline) ? [...pipeline] : []

  // ---------- FOLLOWING filter ----------
  const canApplyFollowing = type === "Post" || type === "User"

  if (canApplyFollowing && following && mainUserId) {
    const userIdField = type === "Post" ? "user_info._id" : "_id"

    if (following === "following") {
      basePipeline.push({
        $lookup: {
          from: "followers",
          let: { userId: `$${userIdField}` },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$followerId", mainUserId] },
                    { $eq: ["$followingId", "$$userId"] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "following_info",
        },
      })

      basePipeline.push({
        $match: { "following_info.0": { $exists: true } },
      })
    }

    if (following === "friends") {
      basePipeline.push({
        $lookup: {
          from: "followers",
          let: { userId: `$${userIdField}` },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$followerId", mainUserId] },
                    { $eq: ["$followingId", "$$userId"] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "following_info",
        },
      })

      basePipeline.push({
        $lookup: {
          from: "followers",
          let: { userId: `$${userIdField}` },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$followingId", mainUserId] },
                    { $eq: ["$followerId", "$$userId"] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "followers_info",
        },
      })

      basePipeline.push({
        $match: {
          $and: [
            { "following_info.0": { $exists: true } },
            { "followers_info.0": { $exists: true } },
          ],
        },
      })
    }
  }

  // ---------- SORT ----------
  let sortStage
  switch (order) {
    case "relevant":
      sortStage = {
        $sort: { relevance: -1, created_at: -1, timeZoneMatch: -1, _id: -1 },
      }
      break
    case "recent_ban":
      sortStage = { $sort: { ban_date: -1, _id: -1 } }
      break
    case "recent":
    default:
      sortStage = { $sort: { created_at: -1, timeZoneMatch: -1, _id: -1 } }
      break
  }

  // ---------- MODEL ----------
  let Model = MODEL_BY_TYPE[type]
  if (!Model) Model = MODEL_BY_TYPE[DEFAULT_MODEL]

  try {
    const aggregationPipeline = [
      {
        $facet: {
          data: [
            ...basePipeline,
            sortStage,
            { $skip: skipCount },
            { $limit: size },
          ],
          totalCount: [...basePipeline, { $count: "total" }],
        },
      },
      {
        $addFields: {
          totalCount: {
            $ifNull: [{ $arrayElemAt: ["$totalCount.total", 0] }, 0],
          },
        },
      },
    ]

    const result = await Model.aggregate(aggregationPipeline)
    const row = result?.[0] || {}
    const data = serializeMediaPayload(row.data || [])
    const totalCount = row.totalCount || 0

    const totalPages = totalCount ? Math.ceil(totalCount / size) : 0

    return {
      data,
      page: p,
      pageSize: data.length,
      maxPageSize: size,
      totalPages,
      totalCount,
    }
  } catch (error) {
    throw new Error(error?.message || "Aggregation error")
  }
}

module.exports = getDataWithPages
