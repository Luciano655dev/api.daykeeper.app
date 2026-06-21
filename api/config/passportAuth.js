const LocalStrategy = require("passport-local").Strategy
const User = require("../models/User")

// Google sign-in is handled statelessly via POST /auth/google (ID-token
// verification in services/auth/googleLogin.js), so no passport Google strategy
// is registered here. Local strategy still backs POST /auth/login.
module.exports = function (passport) {
  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          email = (email || "").trim().toLowerCase()

          const user = await User.findOne({ email })
          return done(null, user)
        } catch (err) {
          return done(err)
        }
      }
    )
  )

  passport.serializeUser((user, done) => {
    done(null, user._id)
  })

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id)
      done(null, user)
    } catch (err) {
      done(err, null)
    }
  })
}
