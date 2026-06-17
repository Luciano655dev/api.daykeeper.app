const express = require("express")
const router = express.Router()
const {
  getPostById,
  createPost,
  updatePost,
  deletePost,
  reportPost,
  likePost,
  getPostLikes,
  getPostComments,
  getCommentById,
  getCommentReplies,
  commentOnComment,
  commentPost,
  likeComment,
  getCommentLikes,
  deleteComment,
} = require("../api/controllers/postController")

// Middlewares
const multer = require("multer")
const multerConfig = require("../api/config/multer")
const handleMulterError = require("../middlewares/handleMulterError") // status de erro bonitinho do multer :)
const postValidation = require("../middlewares/validations/post/postValidation")
const postEditValidation = require("../middlewares/validations/post/postEditValidation")
const createMediaDocsMW = require("../middlewares/createMediaDocsMW")
const convertImageMW = require("../middlewares/convertImageMW")
const uploadToStorageMW = require("../middlewares/uploadToStorageMW")

const checkTokenMW = require("../middlewares/checkTokenMW")
const calculateTrustScoreMW = require("../middlewares/calculateTrustScoreMW")

const detectInappropriateFileMW = require("../middlewares/detectInappropriateFileMW")

// Routes
router.get("/:postId", checkTokenMW, getPostById) // One Post
router.post(
  "/create",
  checkTokenMW,
  multer(multerConfig("both")).array("files", 5),
  handleMulterError,
  convertImageMW,
  uploadToStorageMW,
  createMediaDocsMW,
  detectInappropriateFileMW,
  postValidation,
  createPost
) // Create Post
router.put(
  "/:postId",
  checkTokenMW,
  multer(multerConfig("both")).array("files", 5),
  handleMulterError,
  convertImageMW,
  uploadToStorageMW,
  calculateTrustScoreMW,
  createMediaDocsMW,
  detectInappropriateFileMW,
  postEditValidation,
  updatePost
) // Edit Post
router.delete("/:postId", checkTokenMW, deletePost) // Delete Post

// ========== interaction ==========
router.post("/:postId/report", checkTokenMW, reportPost) // Report a post
router.post("/:postId/like", checkTokenMW, likePost) // Like a Post
router.get("/:postId/likes", checkTokenMW, getPostLikes) // get post likes
router.post("/:postId/comment", checkTokenMW, commentPost) // Comment in a post
router.get("/:postId/comments", checkTokenMW, getPostComments) // Get Post Comments
router.get("/comment/:commentId", checkTokenMW, getCommentById) // Get comment by id
router.get("/comment/:commentId/replies", checkTokenMW, getCommentReplies) // Get comment replies
router.post("/comment/:commentId/reply", checkTokenMW, commentOnComment) // Reply to a comment
router.delete("/comment/:commentId", checkTokenMW, deleteComment) // Delete a comment
router.post("/comment/:commentId/like", checkTokenMW, likeComment) // Like a comment
router.get("/comment/:commentId/likes", checkTokenMW, getCommentLikes) // get comment likes

module.exports = router
