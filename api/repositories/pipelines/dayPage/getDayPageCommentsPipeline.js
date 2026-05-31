const { Types } = require("mongoose")
const hideUserData = require("../../hideProject/hideUserData")

function getDayPageCommentsPipeline({ dayPageId, parentCommentId = null, mainUser }) {
  const match = {
    dayPageId: new Types.ObjectId(String(dayPageId)),
    status: { $ne: "deleted" },
  }

  if (parentCommentId === null) {
    match.parentCommentId = null
  } else if (parentCommentId) {
    match.parentCommentId = new Types.ObjectId(String(parentCommentId))
  }

  const isTopLevel = parentCommentId === null

  return [
    { $match: match },

    // Reply count — only for top-level comments
    ...(isTopLevel
      ? [
          {
            $lookup: {
              from: "dayPageComments",
              let: { commentId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$parentCommentId", "$$commentId"] },
                        { $ne: ["$status", "deleted"] },
                      ],
                    },
                  },
                },
                { $count: "count" },
              ],
              as: "_repliesCountInfo",
            },
          },
        ]
      : []),

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
        parentCommentId: 1,
        comment: 1,
        gif: 1,
        created_at: 1,
        user: "$_userInfo",
        ...(isTopLevel
          ? {
              repliesCount: {
                $ifNull: [
                  { $arrayElemAt: ["$_repliesCountInfo.count", 0] },
                  0,
                ],
              },
            }
          : {}),
      },
    },
  ]
}

module.exports = getDayPageCommentsPipeline
