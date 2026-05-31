const { Types } = require("mongoose")
const hideUserData = require("../../hideProject/hideUserData")

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function searchDayPagePipeline(searchQuery, mainUser) {
  const safeQuery = escapeRegex(String(searchQuery || "").trim())
  const viewerId = mainUser?._id ? new Types.ObjectId(String(mainUser._id)) : null

  const contentMatch = safeQuery
    ? {
        $or: [
          { "blocks.content": { $regex: safeQuery, $options: "i" } },
          { "blocks.title": { $regex: safeQuery, $options: "i" } },
          { "blocks.description": { $regex: safeQuery, $options: "i" } },
        ],
      }
    : {}

  return [
    { $match: { status: "public", ...contentMatch } },

    // Lookup user — only active, verified, non-banned users
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "_userArr",
        pipeline: [
          {
            $match: {
              status: "public",
              banned: { $ne: true },
              verified_email: true,
            },
          },
          { $project: hideUserData },
        ],
      },
    },
    { $unwind: "$_userArr" },
    { $addFields: { user_info: "$_userArr" } },

    // Privacy gate: only public pages (or the viewer's own)
    {
      $match: {
        $expr: {
          $or: [
            { $eq: ["$privacy", "public"] },
            ...(viewerId ? [{ $eq: ["$user", viewerId] }] : []),
          ],
        },
      },
    },

    // Likes aggregation
    {
      $lookup: {
        from: "dayPageLikes",
        let: { pageId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$dayPageId", "$$pageId"] },
                  { $ne: ["$status", "deleted"] },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalLikes: { $sum: 1 },
              userLiked: {
                $sum: {
                  $cond: [
                    viewerId ? { $eq: ["$userId", viewerId] } : false,
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ],
        as: "_likeInfo",
      },
    },
    { $unwind: { path: "$_likeInfo", preserveNullAndEmptyArrays: true } },

    // Comments count
    {
      $lookup: {
        from: "dayPageComments",
        let: { pageId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$dayPageId", "$$pageId"] },
                  { $ne: ["$status", "deleted"] },
                  { $eq: ["$parentCommentId", null] },
                ],
              },
            },
          },
          { $count: "count" },
        ],
        as: "_commentInfo",
      },
    },

    // Media lookup for image blocks
    {
      $lookup: {
        from: "media",
        let: {
          mediaIds: {
            $map: {
              input: {
                $filter: {
                  input: "$blocks",
                  as: "b",
                  cond: { $eq: ["$$b.type", "image"] },
                },
              },
              as: "b",
              in: "$$b.mediaId",
            },
          },
        },
        pipeline: [
          { $match: { $expr: { $in: ["$_id", "$$mediaIds"] }, status: "public" } },
          { $project: { _id: 1, key: 1, urls: 1 } },
        ],
        as: "_mediaLookup",
      },
    },

    {
      $addFields: {
        likesCount: { $ifNull: ["$_likeInfo.totalLikes", 0] },
        userLiked: { $gt: [{ $ifNull: ["$_likeInfo.userLiked", 0] }, 0] },
        commentsCount: {
          $ifNull: [{ $arrayElemAt: ["$_commentInfo.count", 0] }, 0],
        },
        blocks: {
          $map: {
            input: "$blocks",
            as: "block",
            in: {
              $cond: [
                { $eq: ["$$block.type", "image"] },
                {
                  $mergeObjects: [
                    "$$block",
                    {
                      media: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$_mediaLookup",
                              as: "m",
                              cond: { $eq: ["$$m._id", "$$block.mediaId"] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                  ],
                },
                "$$block",
              ],
            },
          },
        },
      },
    },

    {
      $project: {
        _userArr: 0,
        _likeInfo: 0,
        _commentInfo: 0,
        _mediaLookup: 0,
      },
    },
  ]
}

module.exports = searchDayPagePipeline
