const { OAuth2Client } = require("google-auth-library")
const upsertGoogleUser = require("./upsertGoogleUser")
const login = require("./login")
const {
  google: { clientId, iosClientId, androidClientId },
} = require("../../../config")
const {
  errors: { fieldNotFilledIn, invalidValue },
} = require("../../../constants/index")

// Every client ID we accept ID tokens from (web + mobile). The token's `aud`
// claim must match one of these, or verification fails.
const audiences = [clientId, iosClientId, androidClientId].filter(Boolean)

const client = new OAuth2Client()

/*
  Verifies a Google ID token (signature, issuer, expiry, audience handled by the
  library), upserts the matching user, and issues Daykeeper JWTs by reusing the
  standard `login` service so the response shape matches password login exactly.

  props: { idToken, deviceId, ip, userAgent }
*/
async function googleLogin(props) {
  const { idToken, deviceId, ip, userAgent } = props

  if (!idToken) return fieldNotFilledIn(`idToken`)
  if (!audiences.length) throw new Error("No Google client IDs configured")

  let ticket
  try {
    ticket = await client.verifyIdToken({ idToken, audience: audiences })
  } catch (err) {
    return invalidValue(`Google ID token`)
  }

  const p = ticket.getPayload()
  if (!p || !p.sub) return invalidValue(`Google ID token`)

  const user = await upsertGoogleUser({
    email: p.email,
    googleId: p.sub,
    photo: p.picture || null,
    displayName: p.name || "",
    emailVerified: p.email_verified === true || p.email_verified === "true",
  })

  return login({ user, deviceId, ip, userAgent })
}

module.exports = googleLogin
