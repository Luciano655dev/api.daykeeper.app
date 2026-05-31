const searchPostPipeline = require("./pipelines/search/searchPostPipeline")
const searchUserPipeline = require(`./pipelines/search/searchUserPipeline`)
const userPostsPipeline = require(`./pipelines/user/userPostsPipeline`)
const getUserPostsByDayPipeline = require(`./pipelines/user/getUserPostsByDayPipeline`)
const reportedElementPipeline = require(`./pipelines/general/reportedElementPipeline`)

const bannedElementPipeline = require(`./pipelines/admin/bannedElementPipeline`)
const banHistoryMadeByAdmin = require("./pipelines/admin/bansHistoryMadeByAdminPipeline")
const elementBanHistoryPipeline = require("./pipelines/admin/elementBanHistoryPipeline")

const getUserPipeline = require("./pipelines/user/getUserPipeline")
const getFollowersPipeline = require("./pipelines/user/getFollowersPipeline")
const getFollowingPipeline = require("./pipelines/user/getFollowingPipeline")
const getFollowRequestsPipeline = require("./pipelines/user/getFollowRequestsPipeline")
const getCloseFriendsPipeline = require("./pipelines/user/getCloseFriendsPipeline")
const getBlockedUsersPipeline = require("./pipelines/user/getBlockedUsersPipeline")

const getPostPipeline = require("./pipelines/post/getPostPipeline")
const getPostLikesPipeline = require("./pipelines/post/getPostLikesPipeline")
const getPostCommentsPipeline = require("./pipelines/post/getPostCommentsPipeline")
const getCommentLikesPipeline = require("./pipelines/post/getCommentLikesPipeline")
const getAveragePostLikesPipeline = require("./pipelines/post/getAveragePostLikesPipeline")

const getEventByDatePipeline = require("./pipelines/day/events/getEventByDatePipeline")
const getTasksByDatePipeline = require("./pipelines/day/tasks/getTasksByDatePipeline")

const searchEventPipeline = require("./pipelines/search/searchEventPipeline")
const searchTaskPipeline = require("./pipelines/search/searchTaskPipeline")
const searchDayPagePipeline = require("./pipelines/search/searchDayPagePipeline")
const feedPostPipeline = require("./pipelines/search/feedPostPipeline")
const feedUserMixedPipeline = require("./pipelines/search/feedUserMixedPipeline")
const feedDayPagePipeline = require("./pipelines/search/feedDayPagePipeline")
const getDayPagePipeline = require("./pipelines/dayPage/getDayPagePipeline")
const getDayPageCommentsPipeline = require("./pipelines/dayPage/getDayPageCommentsPipeline")

// Hide Projects
const hideUserData = require(`./hideProject/hideUserData`)
const hidePostData = require(`./hideProject/hidePostData`)
const hideGeneralData = require(`./hideProject/hideGeneralData`)

module.exports = {
  // HIDE
  hideUserData,
  hidePostData,
  hideGeneralData,

  userPostsPipeline,
  reportedElementPipeline,
  feedPostPipeline,
  feedUserMixedPipeline,
  feedDayPagePipeline,

  // DAY PAGE
  getDayPagePipeline,
  getDayPageCommentsPipeline,

  // SEARCH
  searchPostPipeline,
  searchUserPipeline,
  searchEventPipeline,
  searchTaskPipeline,
  searchDayPagePipeline,

  // BANS
  bannedElementPipeline,
  banHistoryMadeByAdmin,
  elementBanHistoryPipeline,

  // DAY RELATED
  getEventByDatePipeline,
  getTasksByDatePipeline,

  // USER RELATED
  getUserPostsByDayPipeline,
  getUserPipeline,
  getFollowersPipeline,
  getFollowingPipeline,
  getFollowRequestsPipeline,
  getCloseFriendsPipeline,
  getBlockedUsersPipeline,

  // POST RELATED
  getPostPipeline,
  getPostLikesPipeline,
  getPostCommentsPipeline,
  getAveragePostLikesPipeline,
  getCommentLikesPipeline,
}
