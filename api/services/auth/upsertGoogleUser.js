const crypto = require("crypto")
const User = require("../../models/User")
const {
  user: { defaultTimeZone, defaultPfp, forbiddenUsernames },
  auth: { maxUsernameLength },
} = require("../../../constants/index")

const FORBIDDEN = new Set(
  (forbiddenUsernames || []).map((u) => String(u).toLowerCase())
)
const MAX_LEN = Number(maxUsernameLength) || 40
const SUFFIX_LEN = 6 // hex chars appended on collision

// Lowercase handle limited to the app's allowed username charset [a-z0-9._],
// matching userRegisterValidation so Google accounts follow the same rules.
function baseUsernameFrom(displayName, email) {
  const clean = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9._]/g, "")

  let base = clean(displayName) || clean(String(email).split("@")[0]) || "user"
  // Leave room for a possible collision suffix.
  base = base.slice(0, Math.max(3, MAX_LEN - SUFFIX_LEN))
  if (base.length < 3) base = `${base}user`.slice(0, MAX_LEN - SUFFIX_LEN)
  return base
}

async function isTaken(name) {
  if (FORBIDDEN.has(name)) return true
  return Boolean(await User.exists({ username: name }))
}

// Pick a username that respects the unique index and the app's rules. Tries the
// base handle, then appends a short random suffix — randomized so it stays cheap
// and contention-free at scale.
async function generateUniqueUsername(displayName, email) {
  const base = baseUsernameFrom(displayName, email)
  if (!(await isTaken(base))) return base

  for (let i = 0; i < 8; i++) {
    const suffix = crypto.randomBytes(3).toString("hex") // 6 hex chars
    const candidate = `${base}${suffix}`.slice(0, MAX_LEN)
    if (!(await isTaken(candidate))) return candidate
  }

  return `user${crypto.randomBytes(8).toString("hex")}`.slice(0, MAX_LEN)
}

/*
  Upserts a user from a Google-verified identity payload.

  payload: { email, googleId, photo, displayName, emailVerified }
  The caller (googleLogin) cryptographically verifies the Google ID token first;
  we still defensively require Google to assert the email is verified before
  linking/creating an account by email.
*/
module.exports = async function upsertGoogleUser(payload) {
  const email = String(payload?.email || "")
    .trim()
    .toLowerCase()
  const googleId = payload?.googleId
  const photo = payload?.photo || null
  const displayName = String(payload?.displayName || "").trim()
  const emailVerified = payload?.emailVerified === true

  if (!email) throw new Error("Google account has no email")
  if (!googleId) throw new Error("Google account has no id")
  if (!emailVerified) throw new Error("Google account email is not verified")

  let user = await User.findOne({ $or: [{ email }, { google_id: googleId }] })

  if (user) {
    if (!user.google_id) user.google_id = googleId

    // Security: if we're linking Google to an account that was never
    // email-verified, any password on it cannot be trusted — someone could have
    // pre-registered with this email hoping the real owner would later sign in
    // with Google. Google has proven ownership, so neutralize that password; the
    // real owner can set a new one via password reset.
    if (user.verified_email !== true && user.password) {
      user.password = null
    }

    if (
      photo &&
      (!user.profile_picture ||
        (!String(user.profile_picture.key || "").trim() &&
          !String(user.profile_picture.url || "").trim()))
    ) {
      user.profile_picture = { url: photo, title: "google_pfp", key: "" }
    }
    if (user.verified_email !== true) user.verified_email = true
    await user.save()
    return user
  }

  // Create — retry on the (rare) race where a concurrent request created the
  // same identity or grabbed the same generated username.
  for (let attempt = 0; attempt < 3; attempt++) {
    const username = await generateUniqueUsername(displayName, email)
    try {
      return await User.create({
        username,
        name: displayName || username,
        displayName: displayName || username,
        email,
        bio: "",
        timeZone: defaultTimeZone,
        profile_picture: photo
          ? { url: photo, title: "google_pfp", key: "" }
          : defaultPfp,
        private: false,
        roles: ["user"],
        blocked_users: [],
        verified_email: true,
        password: null,
        created_at: Date.now(),
        google_id: googleId,
      })
    } catch (err) {
      if (err && err.code === 11000) {
        // A concurrent request may have created this exact identity…
        const existing = await User.findOne({
          $or: [{ email }, { google_id: googleId }],
        })
        if (existing) return existing
        // …otherwise it was a username collision — regenerate and retry.
        continue
      }
      throw err
    }
  }

  throw new Error("Could not create Google user (username contention)")
}
