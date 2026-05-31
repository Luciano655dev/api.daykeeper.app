const mongoose = require("mongoose")

const postCommentsSchema = mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  userPostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Post",
  },
  parentCommentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PostComments",
    default: null,
  },

  created_at: {
    type: Date,
    default: Date.now,
  },
  comment: String,
  gif: {
    title: String,
    id: String,
    url: String,
  },

  status: {
    type: String,
    enum: ["pending", "public", "rejected", "deleted"],
    default: "public",
    index: true,
  },
  deletedAt: { type: Date, default: null, required: false },
})

postCommentsSchema.index({ postId: 1, created_at: -1 })
postCommentsSchema.index({ parentCommentId: 1, created_at: -1 })
postCommentsSchema.index({ userId: 1, created_at: -1 })

const PostComments = mongoose.model(
  "PostComments",
  postCommentsSchema,
  "postComments"
)

module.exports = PostComments
