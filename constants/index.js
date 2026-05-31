const notifications = require("./notifications")
const { errors, errorGif } = require(`./errors`)
const success = require(`./success`)
const messages = require("./messages")
const trustScore = require("./trustScore")
const path = require("path")

const defaultPfpKey = String(
  process.env.DEFAULT_PFP_KEY || "public/DaykeeperPFP.png"
).trim()
const defaultPfpUrl = String(process.env.DEFAULT_PFP_URL || "").trim()
const defaultPfpTitle = String(
  process.env.DEFAULT_PFP_TITLE || path.basename(defaultPfpKey || "DaykeeperPFP.png")
).trim()

module.exports = {
  maxPageSize: 20,
  maxPostsPerUser: 3,
  delete: {
    MediaRetentionDays: 30,
    UserRetentionDays: 30,
    PostRetentionDays: 30,
    dayRetentionDays: 30,
  },
  tokens: {
    AccessTTLSeconds: 60 * 15, // 15 min
    RefreshTTLDays: 30,
  },
  post: {
    maxPostLength: 1000,
    maxCommentLength: 500,
  },
  user: {
    forbiddenUsernames: [
      "auth",
      "post",
      "day",
      "search",
      "day",
      "webhooks",
      "media",
      "create",
    ],
    defaultPfp: {
      title: defaultPfpTitle,
      key: defaultPfpKey,
      url: defaultPfpUrl,
      mimetype: "image/jpeg",
    },
    defaultTimeZone: "America/New_York",
    maxReportReasonLength: 1000,
    maxFollowingCount: 100,
  },
  admin: {
    maxReportMessageLength: 1000,
    daysToDeleteBannedUser: 30,
    daysToDeleteBannedPost: 7,
    reportCountToVerifyFullVideo: 5,
    defaultBannedById: "65cbaab84b9d1cce41e98b60", // change to a default User later
  },
  auth: {
    resetTokenExpiresTime: "1h",
    resetPasswordExpiresTime: 3600000, // 1 h
    registerCodeExpiresTime: 600000, // 10 min
    maxUsernameLength: 40,
    maxEmailLength: 320,
    maxPasswordLength: 50,
    maxBioLength: 1000,
    maxDisplayNameLength: 40,
  },
  day: {
    event: {
      maxEventTitleLength: 50,
      maxEventDescriptionLength: 100,
    },
    task: {
      maxTitleLength: 50,
    },
  },
  dayPage: {
    maxBlocksPerPage: 100,
    maxTextBlockLength: 50000,
    maxTaskTitleLength: 160,
    maxEventTitleLength: 120,
    maxEventDescriptionLength: 2000,
    maxCommentLength: 500,
  },

  inappropriateLabels: [
    // for rekognition
    // Nudity
    "Explicit",
    "Explicit Nudity",
    "Partial Nudity",
    "Sexual Activity",
    "Exposed Female Genitalia",
    "Exposed Male Genitalia",
    "Exposed Buttocks or Anus",
    "Suggestive Content",

    // Violence
    "Violence",
    "Graphic Violence Or Gore",
    "Physical Violence",
    "Self Injury",
    "Visually Disturbing",
    "Emaciated Bodies",
    "Corpses",

    // Drugs
    "Drug Paraphernalia",
    "Drugs",

    // Gambling
    "Gambling",
  ],

  errorGif,
  errors,
  success,
  notifications,
  messages,
  trustScore,
}
