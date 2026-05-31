const {
  maxPageSize: DEFAULT_MAX_PAGE_SIZE,
  errors: { serverError },
} = require("../../constants/index")
const {
  getOrInitDayPage,
  upsertDayPage,
  updateBlock,
  deleteDayPage,
  getUserDayPage,
  addImageBlock,
  addMediaBlocks,
} = require("../services/dayPages/dayPages")
const likeDayPage = require("../services/dayPages/likeDayPage")
const getLikes = require("../services/dayPages/getLikes")
const commentDayPage = require("../services/dayPages/commentDayPage")
const getComments = require("../services/dayPages/getComments")
const getReplies = require("../services/dayPages/getReplies")
const deleteComment = require("../services/dayPages/deleteComment")

function parsePageParams(req) {
  const page = Number(req.query?.page) || 1
  const maxPageSize = req.query?.maxPageSize
    ? Math.min(Number(req.query.maxPageSize), DEFAULT_MAX_PAGE_SIZE)
    : DEFAULT_MAX_PAGE_SIZE
  return { page, maxPageSize }
}

const getOwnPageController = async (req, res) => {
  try {
    const { code, message, data } = await getOrInitDayPage({
      dateStr: req.params.date,
      loggedUser: req.user,
    })
    return res.status(code).json({ message, data })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.toString()) })
  }
}

const upsertPageController = async (req, res) => {
  try {
    const { code, message, data } = await upsertDayPage({
      dateStr: req.params.date,
      ...req.body,
      loggedUser: req.user,
    })
    return res.status(code).json({ message, data })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.toString()) })
  }
}

const updateBlockController = async (req, res) => {
  try {
    const { code, message, data } = await updateBlock({
      dateStr: req.params.date,
      blockId: req.params.blockId,
      update: req.body,
      loggedUser: req.user,
    })
    return res.status(code).json({ message, data })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.toString()) })
  }
}

const deletePageController = async (req, res) => {
  try {
    const { code, message } = await deleteDayPage({
      dateStr: req.params.date,
      loggedUser: req.user,
    })
    return res.status(code).json({ message })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.toString()) })
  }
}

const getUserPageController = async (req, res) => {
  try {
    const { code, message, data } = await getUserDayPage({
      username: req.params.username,
      dateStr: req.params.date,
      loggedUser: req.user,
    })
    return res.status(code).json({ message, data })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.toString()) })
  }
}

const toggleLikeController = async (req, res) => {
  try {
    const { code, message } = await likeDayPage({
      dayPageId: req.params.dayPageId,
      loggedUser: req.user,
    })
    return res.status(code).json({ message })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.toString()) })
  }
}

const getLikesController = async (req, res) => {
  const { page, maxPageSize } = parsePageParams(req)
  try {
    const { code, message, response } = await getLikes({
      dayPageId: req.params.dayPageId,
      loggedUser: req.user,
      page,
      maxPageSize,
    })
    return res.status(code).json({ message, ...response })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.toString()) })
  }
}

const addCommentController = async (req, res) => {
  try {
    const { code, message, data } = await commentDayPage({
      dayPageId: req.params.dayPageId,
      ...req.body,
      loggedUser: req.user,
    })
    return res.status(code).json({ message, data })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.toString()) })
  }
}

const getCommentsController = async (req, res) => {
  const { page, maxPageSize } = parsePageParams(req)
  try {
    const { code, message, response } = await getComments({
      dayPageId: req.params.dayPageId,
      loggedUser: req.user,
      page,
      maxPageSize,
    })
    return res.status(code).json({ message, ...response })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.toString()) })
  }
}

const deleteCommentController = async (req, res) => {
  try {
    const { code, message } = await deleteComment({
      commentId: req.params.commentId,
      loggedUser: req.user,
    })
    return res.status(code).json({ message })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.toString()) })
  }
}

const addReplyController = async (req, res) => {
  try {
    const { code, message, data } = await commentDayPage({
      dayPageId: req.body.dayPageId,
      parentCommentId: req.params.commentId,
      ...req.body,
      loggedUser: req.user,
    })
    return res.status(code).json({ message, data })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.toString()) })
  }
}

const getRepliesController = async (req, res) => {
  const { page, maxPageSize } = parsePageParams(req)
  try {
    const { code, message, response } = await getReplies({
      commentId: req.params.commentId,
      loggedUser: req.user,
      page,
      maxPageSize,
    })
    return res.status(code).json({ message, ...response })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.toString()) })
  }
}

const uploadImageBlockController = async (req, res) => {
  try {
    const mediaDocs = req.mediaDocs || []
    if (!mediaDocs.length) {
      return res.status(400).json({ message: "No image uploaded" })
    }
    const { code, message, data } = await addImageBlock({
      dateStr: req.params.date,
      mediaId: mediaDocs[0]._id,
      loggedUser: req.user,
    })
    return res.status(code).json({ message, data })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.toString()) })
  }
}

const uploadMediaBlocksController = async (req, res) => {
  try {
    const mediaDocs = req.mediaDocs || []
    if (!mediaDocs.length) {
      return res.status(400).json({ message: "No files uploaded" })
    }
    const { code, message, data } = await addMediaBlocks({
      dateStr: req.params.date,
      mediaIds: mediaDocs.map((d) => d._id),
      loggedUser: req.user,
    })
    return res.status(code).json({ message, data })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.toString()) })
  }
}

module.exports = {
  getOwnPage: getOwnPageController,
  uploadImageBlock: uploadImageBlockController,
  uploadMediaBlocks: uploadMediaBlocksController,
  upsertPage: upsertPageController,
  updateBlock: updateBlockController,
  deletePage: deletePageController,
  getUserPage: getUserPageController,
  toggleLike: toggleLikeController,
  getLikes: getLikesController,
  addComment: addCommentController,
  getComments: getCommentsController,
  deleteComment: deleteCommentController,
  addReply: addReplyController,
  getReplies: getRepliesController,
}
