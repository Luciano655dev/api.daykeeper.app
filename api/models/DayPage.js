const mongoose = require("mongoose")

const blockSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["text", "task", "event", "image"],
      required: true,
    },
    order: { type: Number, default: 0 },
    // text
    content: { type: String, trim: true },
    // task & event title
    title: { type: String, trim: true },
    // task
    completed: { type: Boolean, default: false },
    // event
    description: { type: String, trim: true },
    dateStart: { type: Date },
    dateEnd: { type: Date },
    // image
    mediaId: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { _id: true },
)

const dayPageSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  // "YYYY-MM-DD" in the user's local timezone — primary deduplication key
  dateKey: { type: String, required: true },
  // UTC start-of-day for the dateKey — used for range queries and sorting
  date: { type: Date, required: true, index: true },
  privacy: {
    type: String,
    enum: ["public", "private", "close friends"],
    default: "public",
  },
  blocks: { type: [blockSchema], default: [] },
  status: {
    type: String,
    enum: ["public", "pending", "deleted"],
    default: "public",
    index: true,
  },
  deletedAt: { type: Date, default: null },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
})

dayPageSchema.index({ user: 1, dateKey: 1 }, { unique: true })
dayPageSchema.index({ user: 1, date: -1 })
dayPageSchema.index({ date: -1, status: 1 })

module.exports = mongoose.model("DayPage", dayPageSchema)
