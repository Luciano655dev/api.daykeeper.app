const Media = require("../api/models/Media")

async function createMediaDocsMW(req, res, next) {
  if ((!req.files || !req.files.length) && !req.file) return next()
  let files = req.files
  if (!files) files = [req.file]

  try {
    const placesIds = req?.body?.placesIds?.split(",") || []

    const mediaDocs = await Promise.all(
      files.map(async (file, index) => {
        const type = file.mimetype.startsWith("video") ? "video" : "image"

        const doc = await Media.create({
          title: file.originalname,
          key: file.key ?? file.filename,
          type,
          url: "",
          placeId: placesIds[index] || null,
          status: type === "video" ? "pending" : "public",
          uploadedBy: req.user._id,
          created_at: new Date(),
        })

        file.mediaId = doc._id
        return doc
      })
    )

    req.mediaDocs = mediaDocs
    files.forEach((file, i) => {
      file.mediaId = mediaDocs[i]._id
    })
    next()
  } catch (err) {
    console.error("Error creating media docs:", err)
    return res.status(500).json({ message: "Media creation failed." })
  }
}

module.exports = createMediaDocsMW
