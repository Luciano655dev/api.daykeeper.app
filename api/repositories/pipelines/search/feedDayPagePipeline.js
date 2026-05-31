const { Types } = require("mongoose")
const hideUserData = require("../../hideProject/hideUserData")
const {
  user: { defaultTimeZone },
} = require("../../../../constants/index")

function toObjectIdOrNull(value) {
  try {
    if (!value) return null
    if (value instanceof Types.ObjectId) return value
    if (Types.ObjectId.isValid(value)) return new Types.ObjectId(value)
    return null
  } catch {
    return null
  }
}

const feedDayPagePipeline = (mainUser, { dateStr = null, daysWindow = 30 } = {}) => {
  const tz = mainUser?.timeZone || defaultTimeZone
  const mainUserId = toObjectIdOrNull(mainUser?._id)
  const safeDaysWindow = Math.min(365, Math.max(1, Number(daysWindow) || 30))

  const dayStartExpr = dateStr
    ? {
        $dateTrunc: {
          date: {
            $dateFromString: {
              dateString: dateStr,
              format: "%d-%m-%Y",
              timezone: tz,
              onError: null,
              onNull: null,
            },
          },
          unit: "day",
          timezone: tz,
        },
      }
    : {
        $dateTrunc: {
          date: {
            $dateSubtract: {
              startDate: "$$NOW",
              unit: "day",
              amount: safeDaysWindow - 1,
            },
          },
          unit: "day",
          timezone: tz,
        },
      }

  const dayEndExpr = dateStr
    ? { $dateAdd: { startDate: dayStartExpr, unit: "day", amount: 1 } }
    : {
        $dateAdd: {
          startDate: { $dateTrunc: { date: "$$NOW", unit: "day", timezone: tz } },
          unit: "day",
          amount: 1,
        },
      }

  return [
    // ── 1. Only public, non-banned, email-verified users ──────────────────
    {
      $match: { status: "public", banned: { $ne: true }, verified_email: true },
    },

    // ── 2. isFollowing — targeted lookup (avoids loading all follow docs) ──
    {
      $lookup: {
        from: "followers",
        let: { userId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ["$requested", true] },
                  { $ne: ["$status", "deleted"] },
                  { $eq: ["$followerId", mainUserId] },
                  { $eq: ["$followingId", "$$userId"] },
                ],
              },
            },
          },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: "_isFollowingDocs",
      },
    },
    {
      $addFields: {
        isFollowing: {
          $cond: [
            { $eq: ["$_id", mainUserId] },
            0,
            { $cond: [{ $gt: [{ $size: "$_isFollowingDocs" }, 0] }, 1, 0] },
          ],
        },
      },
    },

    // ── 3. isCloseFriend ──────────────────────────────────────────────────
    {
      $lookup: {
        from: "closeFriends",
        let: { userId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$userId", "$$userId"] },
                  { $eq: ["$closeFriendId", mainUserId] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "_isInCloseFriends",
      },
    },
    {
      $addFields: {
        isCloseFriend: {
          $cond: [{ $gt: [{ $size: { $ifNull: ["$_isInCloseFriends", []] } }, 0] }, 1, 0],
        },
      },
    },

    // ── 4. Hide private-account users the viewer doesn't follow ───────────
    {
      $match: {
        $expr: {
          $or: [
            { $ne: ["$private", true] },
            { $eq: ["$_id", mainUserId] },
            { $gt: ["$isFollowing", 0] },
          ],
        },
      },
    },

    { $addFields: { _dayStart: dayStartExpr, _dayEnd: dayEndExpr } },

    // ── 5. DayPage lookup — sorted, limited, then enriched ────────────────
    {
      $lookup: {
        from: "daypages",
        let: {
          uid: "$_id",
          dayStart: "$_dayStart",
          dayEnd: "$_dayEnd",
          viewerId: mainUserId,
          isCloseFriend: "$isCloseFriend",
        },
        pipeline: [
          // Filter to pages this viewer is allowed to see, with real content
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$user", "$$uid"] },
                  { $eq: ["$status", "public"] },
                  { $gte: ["$date", "$$dayStart"] },
                  { $lt: ["$date", "$$dayEnd"] },
                  // Must have at least one block (skip empty/blank pages)
                  { $gt: [{ $size: { $ifNull: ["$blocks", []] } }, 0] },
                  {
                    $or: [
                      { $eq: ["$$viewerId", "$$uid"] },
                      { $eq: ["$privacy", "public"] },
                      {
                        $and: [
                          { $eq: ["$privacy", "close friends"] },
                          { $eq: ["$$isCloseFriend", 1] },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
          // Most recent page first, then take just one
          { $sort: { date: -1 } },
          { $limit: 1 },
          // Enrich the single selected page with engagement counts
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
                      $sum: { $cond: [{ $eq: ["$userId", mainUserId] }, 1, 0] },
                    },
                  },
                },
              ],
              as: "_likeInfo",
            },
          },
          { $unwind: { path: "$_likeInfo", preserveNullAndEmptyArrays: true } },
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
              isOwner: { $eq: ["$user", mainUserId] },
            },
          },
          { $project: { _likeInfo: 0, _commentInfo: 0 } },
        ],
        as: "_pages",
      },
    },

    // ── 6. Discard users with no visible page in the window ───────────────
    {
      $match: { $expr: { $gt: [{ $size: "$_pages" }, 0] } },
    },

    {
      $addFields: {
        page: { $arrayElemAt: ["$_pages", 0] },
      },
    },

    {
      $project: {
        _isFollowingDocs: 0,
        _isInCloseFriends: 0,
        _pages: 0,
        _dayStart: 0,
        _dayEnd: 0,
      },
    },

    {
      $addFields: {
        user_info: {
          _id: "$_id",
          username: "$username",
          displayName: "$displayName",
          email: "$email",
          profile_picture: "$profile_picture",
          timeZone: "$timeZone",
          bio: "$bio",
          verified_email: "$verified_email",
          private: "$private",
          roles: "$roles",
          currentStreak: "$currentStreak",
          maxStreak: "$maxStreak",
          created_at: "$created_at",
          banned: "$banned",
          status: "$status",
        },
      },
    },
    { $project: { ...hideUserData, name: 0 } },

    // ── 7. Compute sort fields ────────────────────────────────────────────
    // created_at → page date so "recent" order sorts by post recency, not user sign-up date
    // relevance  → boosts followed users for "relevant" / "follow_first" order
    {
      $addFields: {
        created_at: "$page.date",
        relevance: {
          $add: [
            { $multiply: ["$isFollowing", 10] },
            { $multiply: [{ $ifNull: ["$page.likesCount", 0] }, 0.5] },
          ],
        },
      },
    },

    {
      $project: {
        _id: 1,
        user_info: 1,
        isFollowing: 1,
        isCloseFriend: 1,
        created_at: 1,
        relevance: 1,
        page: 1,
      },
    },
  ]
}

module.exports = feedDayPagePipeline
