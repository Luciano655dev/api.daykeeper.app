const mongoose = require("mongoose")

const postSchema = mongoose.Schema({
  date: Date,
  data: String,
  emotion: Number,
  media: [{ type: mongoose.Schema.Types.ObjectId, ref: "Media" }],

  privacy: {
    type: String,
    enum: ["public", "private", "close friends"],
    default: "public",
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  edited_at: {
    type: Date,
    required: false,
  },
  created_at: {
    type: Date,
    default: Date.now,
    required: true,
  },

  status: {
    type: String,
    enum: ["pending", "public", "rejected", "deleted"],
    default: "pending",
    index: true,
  },
  deletedAt: { type: Date, default: null, required: false },

  banned: { type: Boolean, required: false },
})

// indexes
postSchema.index({ user: 1, created_at: 1 })

const Post = mongoose.model("Post", postSchema)

module.exports = Post
