const mongoose = require("mongoose")

const dayPageLikeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  dayPageUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  dayPageId: { type: mongoose.Schema.Types.ObjectId, ref: "DayPage" },
  status: {
    type: String,
    enum: ["pending", "public", "rejected", "deleted"],
    default: "public",
    index: true,
  },
  deletedAt: { type: Date, default: null },
  created_at: { type: Date, default: Date.now },
})

dayPageLikeSchema.index({ userId: 1, dayPageId: 1 }, { unique: true })
dayPageLikeSchema.index({ dayPageId: 1 })

module.exports = mongoose.model("DayPageLike", dayPageLikeSchema, "dayPageLikes")
