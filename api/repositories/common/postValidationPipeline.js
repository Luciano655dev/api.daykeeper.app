const { Types } = require("mongoose")

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

const postValidationPipeline = (mainUser) => {
  const mainUserId = toObjectIdOrNull(mainUser?._id)

  return [
    {
      $lookup: {
        from: "users",
        let: {
          userId: {
            $convert: {
              input: "$user",
              to: "objectId",
              onError: null,
              onNull: null,
            },
          },
        },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$userId"] } } },
          { $project: { password: 0, device_tokens: 0 } },
        ],
        as: "user_info",
      },
    },
    { $unwind: "$user_info" },

    // Join media — include pending so the owner can see their video while it's being reviewed
    {
      $lookup: {
        from: "media",
        let: { mediaIds: "$media" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $in: [
                      "$_id",
                      {
                        $filter: {
                          input: {
                            $map: {
                              input: { $ifNull: ["$$mediaIds", []] },
                              as: "id",
                              in: {
                                $convert: {
                                  input: "$$id",
                                  to: "objectId",
                                  onError: null,
                                  onNull: null,
                                },
                              },
                            },
                          },
                          as: "oid",
                          cond: { $ne: ["$$oid", null] },
                        },
                      },
                    ],
                  },
                  { $not: { $in: ["$status", ["rejected", "deleted"]] } },
                ],
              },
            },
          },
        ],
        as: "media",
      },
    },

    // Following relationship
    {
      $lookup: {
        from: "followers",
        let: { postUserId: "$user_info._id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$followerId", mainUserId] },
                  { $eq: ["$followingId", "$$postUserId"] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "following_info",
      },
    },

    // Block relationship (me -> them)
    {
      $lookup: {
        from: "blocks",
        let: { postUserId: "$user_info._id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$blockId", mainUserId] },
                  { $eq: ["$blockedId", "$$postUserId"] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "block_info",
      },
    },

    // Block relationship (them -> me)
    {
      $lookup: {
        from: "blocks",
        let: { postUserId: "$user_info._id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$blockId", "$$postUserId"] },
                  { $eq: ["$blockedId", mainUserId] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "blocked_by_owner_info",
      },
    },

    // Close friends relationship
    {
      $lookup: {
        from: "closeFriends",
        let: { postUserId: "$user_info._id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$userId", "$$postUserId"] },
                  { $eq: ["$closeFriendId", mainUserId] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "isInCloseFriends",
      },
    },

    {
      $match: {
        $and: [
          // Not blocked by me
          { "block_info.0": { $exists: false } },

          // Not blocked by post owner
          { "blocked_by_owner_info.0": { $exists: false } },

          // Post owner not banned
          { "user_info.banned": { $ne: true } },
          {
            $or: [
              { "user_info.verified_email": { $ne: false } },
              { "user_info._id": mainUserId },
            ],
          },

          // Post must be public — or pending and owned by the viewer
          {
            $or: [
              { status: "public" },
              {
                $expr: {
                  $and: [
                    { $eq: ["$status", "pending"] },
                    { $eq: ["$user_info._id", mainUserId] },
                  ],
                },
              },
            ],
          },

          // post privacy rules
          {
            $or: [
              { privacy: "public" },
              { privacy: { $exists: false } },

              // private: only owner can see
              {
                $and: [{ privacy: "private" }, { "user_info._id": mainUserId }],
              },

              // close friends: owner OR close friend can see
              {
                $and: [
                  { privacy: { $in: ["close friends", "close_friends"] } },
                  {
                    $or: [
                      // owner always sees their own post
                      { "user_info._id": mainUserId },

                      // close friend sees it
                      { "isInCloseFriends.0": { $exists: true } },
                    ],
                  },
                ],
              },
            ],
          },

          // If the user is private, require following
          {
            $or: [
              { "user_info.private": { $ne: true } },
              { "following_info.0": { $exists: true } },
              { "user_info._id": mainUserId },
            ],
          },
        ],
      },
    },
  ]
}

module.exports = postValidationPipeline
