const express = require("express")
const router = express.Router()
const passport = require("passport")
const passportConfig = require("../api/config/passportAuth")

const {
  login,
  googleLogin,
  register,
  refresh,
  logout,
  userData,
  confirmEmail,
  resendCode,
  forgetPassword,
  resetPassword,
  requestDeleteAccountCode,
} = require("../api/controllers/authController")

const userRegisterValidation = require("../middlewares/validations/auth/userRegisterValidation")
const userLoginValidation = require("../middlewares/validations/auth/userLoginValidation")
const checkTokenMW = require("../middlewares/checkTokenMW")
const rateLimit = require("../middlewares/rateLimit")

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  methods: ["POST"],
})

const googleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  methods: ["POST"],
})

passportConfig(passport)

router.post("/register", userRegisterValidation, register)
router.post("/confirm_email", confirmEmail)
router.post("/forget_password", forgetPassword)
router.post("/reset_password", resetPassword)
router.post("/resend_code", resendCode)
router.post("/request_delete_code", checkTokenMW, requestDeleteAccountCode)

router.get("/user", checkTokenMW, userData)

router.post(
  "/login",
  userLoginValidation,
  passport.authenticate("local"),
  login
)

router.post("/refresh", refreshLimiter, refresh)
router.post("/logout", logout)

// Unified Google sign-in: web (GIS) and mobile (expo-auth-session) both obtain a
// Google ID token client-side and POST it here for server-side verification.
router.post("/google", googleLimiter, googleLogin)

module.exports = router
