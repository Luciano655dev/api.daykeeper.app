const express = require("express")
const multer = require("multer")
const router = express.Router()
const {
  getOwnPage,
  upsertPage,
  updateBlock,
  deletePage,
  getUserPage,
  toggleLike,
  getLikes,
  addComment,
  getComments,
  deleteComment,
  addReply,
  getReplies,
  uploadImageBlock,
  uploadMediaBlocks,
} = require("../api/controllers/dayPageController")

const checkTokenMW = require("../middlewares/checkTokenMW")
const MulterConfig = require("../api/config/multer")
const handleMulterError = require("../middlewares/handleMulterError")
const convertImageMW = require("../middlewares/convertImageMW")
const uploadToStorageMW = require("../middlewares/uploadToStorageMW")
const createMediaDocsMW = require("../middlewares/createMediaDocsMW")
const detectInappropriateFileMW = require("../middlewares/detectInappropriateFileMW")

const imageUpload = multer(MulterConfig("image"))
const mediaUpload = multer(MulterConfig("both"))

// Own pages (DD-MM-YYYY date format)
router.get("/:date", checkTokenMW, getOwnPage)
router.put("/:date", checkTokenMW, upsertPage)
router.patch("/:date/blocks/:blockId", checkTokenMW, updateBlock)
router.delete("/:date", checkTokenMW, deletePage)
router.post(
  "/:date/image-block",
  checkTokenMW,
  imageUpload.single("file"),
  handleMulterError,
  convertImageMW,
  uploadToStorageMW,
  createMediaDocsMW,
  uploadImageBlock,
)
router.post(
  "/:date/media",
  checkTokenMW,
  mediaUpload.array("files", 5),
  handleMulterError,
  convertImageMW,
  uploadToStorageMW,
  createMediaDocsMW,
  detectInappropriateFileMW,
  uploadMediaBlocks,
)

// Viewing another user's page
router.get("/user/:username/:date", checkTokenMW, getUserPage)

// Likes
router.post("/:dayPageId/like", checkTokenMW, toggleLike)
router.get("/:dayPageId/likes", checkTokenMW, getLikes)

// Comments
router.post("/:dayPageId/comment", checkTokenMW, addComment)
router.get("/:dayPageId/comments", checkTokenMW, getComments)
router.delete("/comment/:commentId", checkTokenMW, deleteComment)
router.post("/comment/:commentId/reply", checkTokenMW, addReply)
router.get("/comment/:commentId/replies", checkTokenMW, getReplies)

module.exports = router
