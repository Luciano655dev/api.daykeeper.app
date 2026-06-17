const fs = require("fs")
const path = require("path")
const { spawn } = require("child_process")

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stderr = ""
    child.stderr.on("data", (d) => (stderr += d.toString()))
    child.on("close", (code) => {
      if (code !== 0)
        return reject(new Error(`${cmd} exited with ${code}: ${stderr}`))
      resolve()
    })
  })
}

function probeDurationSeconds(videoPath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ]
    const child = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] })

    let out = ""
    let err = ""
    child.stdout.on("data", (d) => (out += d.toString()))
    child.stderr.on("data", (d) => (err += d.toString()))

    child.on("close", (code) => {
      if (code !== 0)
        return reject(new Error(`ffprobe exited with ${code}: ${err}`))
      const n = Number(String(out).trim())
      if (!Number.isFinite(n) || n <= 0)
        return reject(new Error("Could not read video duration"))
      resolve(n)
    })
  })
}

async function generateVideoThumbnails(
  videoPath,
  outputDir,
  { maxWidth = 480, quality = 5 } = {},
) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

  const jobDir = fs.mkdtempSync(path.join(outputDir, "job-"))
  const ext = "jpg"

  // Get duration to spread frames across whole video
  const duration = await probeDurationSeconds(videoPath)

  // 1 frame for short clips, 2 for medium, 3 for long — enough for moderation
  const count = duration < 30 ? 1 : duration < 180 ? 2 : 3

  // pick timestamps skipping first/last 5% to avoid black frames
  const start = duration * 0.05
  const end = duration * 0.95
  const step = count > 1 ? (end - start) / (count - 1) : 0

  const files = []

  for (let i = 0; i < count; i++) {
    const t = start + step * i
    const outFile = path.join(
      jobDir,
      `thumb-${String(i + 1).padStart(3, "0")}.${ext}`,
    )

    const vf = [
      // scale to maxWidth while keeping aspect ratio; ensure even dims
      `scale='min(${maxWidth},iw)':-2`,
    ].join(",")

    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(t),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      vf,
      // JPEG quality: 2(best)..31(worst). 4-6 is good for moderation.
      "-q:v",
      String(quality),
      outFile,
    ]

    await run("ffmpeg", args)
    files.push(outFile)
  }

  // sanity check
  const existing = files.filter((f) => fs.existsSync(f))
  if (existing.length === 0) {
    throw new Error("Nenhum thumbnail foi gerado pelo ffmpeg.")
  }

  return existing
}

module.exports = generateVideoThumbnails
