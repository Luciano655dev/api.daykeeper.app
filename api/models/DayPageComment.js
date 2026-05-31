const mongoose = require("mongoose")

const dayPageCommentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  dayPageUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  dayPageId: { type: mongoose.Schema.Types.ObjectId, ref: "DayPage" },
  parentCommentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DayPageComment",
    default: null,
  },
  comment: { type: String, trim: true },
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
  deletedAt: { type: Date, default: null },
  created_at: { type: Date, default: Date.now },
})

dayPageCommentSchema.index({ dayPageId: 1, created_at: -1 })
dayPageCommentSchema.index({ parentCommentId: 1, created_at: -1 })
dayPageCommentSchema.index({ userId: 1, created_at: -1 })

module.exports = mongoose.model(
  "DayPageComment",
  dayPageCommentSchema,
  "dayPageComments",
)
