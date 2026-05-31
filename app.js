const express = require("express")
const session = require("express-session")
const MongoStore = require("connect-mongo")
const mongoose = require("mongoose")
const cookieParser = require("cookie-parser")
const passport = require("passport")
const cors = require("cors")
const helmet = require("helmet")
const dotenv = require("dotenv")
dotenv.config()

const passportConfig = require("./api/config/passportAuth")
const rateLimit = require("./middlewares/rateLimit")

const app = express()
const nodeEnv = String(process.env.NODE_ENV || "").toLowerCase()
const isProd = nodeEnv === "prod" || nodeEnv === "production"
const parseBool = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback
  const normalized = String(value).trim().toLowerCase()
  if (["true", "1", "yes", "on"].includes(normalized)) return true
  if (["false", "0", "no", "off"].includes(normalized)) return false
  return fallback
}

app.disable("x-powered-by")

// IMPORTANT when behind a proxy / load balancer (Render, Railway, Nginx, etc.)
app.set("trust proxy", 1)

// --------- Security + parsing ---------
app.use(helmet())

// --------- Rate limiting ---------
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  methods: ["POST", "PUT", "PATCH", "DELETE"],
})

const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  methods: ["GET"],
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  methods: ["POST"],
})

app.use(writeLimiter)
app.use(readLimiter)

app.use(cookieParser())
app.use(express.json({ limit: "1mb" }))
app.use(express.urlencoded({ extended: true, limit: "1mb" }))

// --------- CORS (supports credentials) ---------
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

if (allowedOrigins.length === 0) {
  allowedOrigins.push("https://daykeeper.app", "https://www.daykeeper.app")
}

if (!isProd) {
  allowedOrigins.push("http://localhost:3000", "http://localhost:3001", "http://localhost:3002")
}
const allowAllCors = process.env.CORS_ALLOW_ALL === "true"

app.use(
  cors({
    origin: (origin, cb) => {
      if (allowAllCors) return cb(null, true)
      // Allow server-to-server / tools without Origin header
      if (!origin) return cb(null, true)

      // Allow listed origins only
      if (allowedOrigins.includes(origin)) return cb(null, true)

      return cb(new Error("Not allowed by CORS"))
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
)

// Optional: handle preflight quicker
app.options("*", cors())

// --------- MongoDB ---------
if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is missing in env")
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("\x1b[36mDatabase connected successfully\x1b[0m"))
  .catch((err) => console.error("Mongo connection error:", err))

// --------- Sessions (needed for serializeUser/deserializeUser) ---------
if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is missing in env")
}

// SameSite rule of thumb:
// - If your frontend is on a DIFFERENT site and must send cookies cross-site,
//   you need SameSite="none" + Secure=true (so only works on HTTPS).
// - If same-site (or dev), Lax is fine.
const sameSite = isProd ? "none" : "lax"

app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      ttl: 60 * 60 * 24, // 1 day
      touchAfter: 24 * 3600,
    }),
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite,
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
)

// --------- Passport ---------
app.use(passport.initialize())
app.use(passport.session())
passportConfig(passport)

// --------- Background workers/jobs (optional) ---------
// Cost-safe defaults: workers/jobs are disabled unless explicitly enabled.
// This prevents accidental Redis/cron usage in local/dev environments.
const startWorkers = parseBool(process.env.WORKER_ENABLED, false)
const startJobs = parseBool(process.env.JOBS_ENABLED, false)

if (startWorkers) {
  require("./queue/index.js")
}

if (startJobs) {
  require("./api/jobs/index.js")
}

// --------- Local image serving (development only) ---------
// In production STORAGE_TYPE must be "s3". Only enable local static serving
// when explicitly opted in, so this can never accidentally run in prod.
if ((process.env.STORAGE_TYPE || "s3") === "local") {
  const localUploadsDir = require("path").join(__dirname, "api", "tmp", "uploads")
  app.use("/uploads", express.static(localUploadsDir))
  console.log(`\x1b[33m[local] Serving uploads from ${localUploadsDir}\x1b[0m`)
}

// --------- Routes ---------
app.get("/ping", (req, res) => res.status(200).send("PONG"))

app.use("/webhooks", require("./routes/webhooks"))
app.use("/auth", authLimiter, require("./routes/authRoutes"))
app.use("/post", require("./routes/postRoutes"))
app.use("/day", require("./routes/dayRoutes"))
app.use("/day-pages", require("./routes/dayPageRoutes"))
app.use("/admin", require("./routes/adminRoutes"))
app.use("/media", require("./routes/mediaRoutes"))
app.use("/notifications", require("./routes/notificationRoutes"))
app.use("/sessions", require("./routes/deviceSessionRoutes"))
app.use("/", require("./routes/searchRoutes"))
app.use("/", require("./routes/userRoutes"))

// --------- Errors ---------
app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({
    message: isProd ? "Server error" : err.message || "Server error",
  })
})

// --------- Start ---------
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.clear()
  console.log(`\x1b[36mServer running at http://localhost:${PORT}\x1b[0m`)
})

module.exports = app
