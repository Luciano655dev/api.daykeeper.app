const mongoose = require("mongoose")
const DayPage = require("../../models/DayPage")
const DayPageLike = require("../../models/DayPageLike")
const { createNotificationWithLimits } = require("../notification/createNotification")
const {
  success: { custom },
  errors: { notFound, invalidValue },
} = require("../../../constants/index")

async function likeDayPage({ dayPageId, loggedUser }) {
  if (!dayPageId || !mongoose.Types.ObjectId.isValid(dayPageId)) {
    return invalidValue("dayPageId")
  }

  const page = await DayPage.findOne({
    _id: dayPageId,
    status: "public",
  })
  if (!page) return notFound("DayPage")

  const existing = await DayPageLike.findOne({
    userId: loggedUser._id,
    dayPageId: page._id,
  })

  if (existing) {
    await DayPageLike.deleteOne({ userId: loggedUser._id, dayPageId: page._id })
    return custom("DayPage unliked successfully", {})
  }

  await DayPageLike.create({
    userId: loggedUser._id,
    dayPageUserId: page.user,
    dayPageId: page._id,
  })

  if (String(page.user) !== String(loggedUser._id)) {
    await createNotificationWithLimits({
      userId: page.user,
      type: "daypage_like",
      title: "New like",
      body: `@${loggedUser.username} liked your day.`,
      data: {
        actorId: loggedUser._id,
        actorUsername: loggedUser.username,
        targetId: page._id,
        dayPageId: page._id,
      },
      actorId: loggedUser._id,
      targetId: page._id,
      debounceMs: 60 * 1000,
      maxPerWindow: 30,
      windowMs: 60 * 60 * 1000,
    }).catch(() => null)
  }

  return custom("DayPage liked successfully", {})
}

module.exports = likeDayPage
