const express = require("express")
const router = express.Router()
const {
  getUser,
  getUserPosts,
  getUserPostsByDay,
  getUserCalendar,
  updateUser,
  reseteProfilePicture,
  deleteUser,
  followUser,
  getFollowing,
  getFollowers,
  getFollowRequests,
  respondFollowRequest,
  removeFollower,
  addOrRemoveFromCloseFriends,
  getCloseFriends,
  blockUser,
  getBlockedUsers,
  reportUser,
} = require("../api/controllers/userController")

// Middlewares
const multer = require("multer")
const multerConfig = require("../api/config/multer")
const handleMulterError = require("../middlewares/handleMulterError")
const userEditValidation = require("../middlewares/validations/user/userEditValidation")
const checkTokenMW = require("../middlewares/checkTokenMW")
const checkValidUserMW = require("../middlewares/checkValidUserMW")
const checkBannedUserMW = require("../middlewares/checkBannedUserMW")

const detectInappropriateFileMW = require("../middlewares/detectInappropriateFileMW")
const convertImageMW = require("../middlewares/convertImageMW")
const uploadToStorageMW = require("../middlewares/uploadToStorageMW")

// Routes
router.get("/blocks", checkTokenMW, getBlockedUsers)
router.get("/follow_requests", checkTokenMW, getFollowRequests)
router.put(
  "/user",
  checkTokenMW,
  multer(multerConfig("image")).single("file"),
  handleMulterError,
  convertImageMW,
  uploadToStorageMW,
  detectInappropriateFileMW,
  userEditValidation,
  updateUser
)
router.put("/reset_profile_picture", checkTokenMW, reseteProfilePicture)
router.delete("/user", checkTokenMW, deleteUser)

// Follows
router.get("/:username/followers", checkTokenMW, getFollowers)
router.get("/:username/following", checkTokenMW, getFollowing)
router.post(
  "/:username/follow",
  checkTokenMW,
  (req, res, next) => {
    req.allowPrivateAccess = true
    next()
  },
  checkValidUserMW,
  followUser
)
router.post(
  "/:username/respond_follow",
  checkTokenMW,
  checkValidUserMW,
  respondFollowRequest
)
router.delete(
  "/:name/follower",
  checkTokenMW,
  checkBannedUserMW,
  removeFollower
)

// Close Friends
router.post(
  "/close_friends/:username",
  checkTokenMW,
  checkValidUserMW,
  addOrRemoveFromCloseFriends
)
router.get("/close_friends", checkTokenMW, getCloseFriends)

// Interactions
router.post("/:username/block", checkTokenMW, checkBannedUserMW, blockUser)
router.post("/:username/report", checkTokenMW, checkBannedUserMW, reportUser)

// posts
router.get("/:username/posts", checkTokenMW, checkValidUserMW, getUserPosts)
router.get("/:username/posts/:date", checkTokenMW, getUserPostsByDay)
router.get("/:username/calendar", checkTokenMW, checkValidUserMW, getUserCalendar)

// GET USER
router.get("/:username", checkTokenMW, getUser)

module.exports = router
