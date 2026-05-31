const { Types } = require("mongoose")

function getDayPagePipeline({ userId, dateKey, loggedUser }) {
  const viewerId = loggedUser?._id ? new Types.ObjectId(String(loggedUser._id)) : null
  const ownerId = new Types.ObjectId(String(userId))

  return [
    { $match: { user: ownerId, dateKey, status: "public" } },

    // Check if viewer is in owner's close friends list
    {
      $lookup: {
        from: "closeFriends",
        let: { ownerId: "$user" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$userId", "$$ownerId"] },
                  { $eq: ["$closeFriendId", viewerId] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "_closeFriendCheck",
      },
    },
    {
      $addFields: {
        _isCloseFriend: { $gt: [{ $size: "$_closeFriendCheck" }, 0] },
      },
    },

    // Privacy gate
    {
      $match: {
        $expr: {
          $or: [
            { $eq: ["$user", viewerId] },
            { $eq: ["$privacy", "public"] },
            {
              $and: [
                { $eq: ["$privacy", "close friends"] },
                "$_isCloseFriend",
              ],
            },
          ],
        },
      },
    },

    // Resolve media docs for image blocks
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
          { $match: { $expr: { $in: ["$_id", "$$mediaIds"] } } },
          { $project: { _id: 1, key: 1, urls: 1 } },
        ],
        as: "_mediaLookup",
      },
    },
    {
      $addFields: {
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
                $sum: { $cond: [{ $eq: ["$userId", viewerId] }, 1, 0] },
              },
            },
          },
        ],
        as: "_likeInfo",
      },
    },
    { $unwind: { path: "$_likeInfo", preserveNullAndEmptyArrays: true } },

    // Top-level comments count
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

    {
      $addFields: {
        likesCount: { $ifNull: ["$_likeInfo.totalLikes", 0] },
        userLiked: { $gt: [{ $ifNull: ["$_likeInfo.userLiked", 0] }, 0] },
        commentsCount: {
          $ifNull: [{ $arrayElemAt: ["$_commentInfo.count", 0] }, 0],
        },
        isOwner: { $eq: ["$user", viewerId] },
      },
    },

    {
      $project: {
        _closeFriendCheck: 0,
        _isCloseFriend: 0,
        _likeInfo: 0,
        _commentInfo: 0,
        _mediaLookup: 0,
      },
    },
  ]
}

module.exports = getDayPagePipeline
