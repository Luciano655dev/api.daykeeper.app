require("dotenv").config()

module.exports = {
  secret: process.env.SECRET,
  giphy: {
    apiKey: process.env.GIPHY_API_KEY,
  },
  mongodb: {
    dbUser: process.env.DB_USER,
    dbPass: process.env.DB_PASS,
  },
  aws: {
    bucketName: process.env.BUCKET_NAME,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    snsTopicArn: process.env.SNS_TOPIC_ARN,
    rekogRoleArn: process.env.REKOG_ROLE_ARN,
    storageType: process.env.STORAGE_TYPE || "s3",
    defaultRegion: process.env.AWS_DEFAULT_REGION,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    apiKey: process.env.GOOGLE_API_KEY,
  },
  mail: {
    service: process.env.EMAIL_SERVICE,
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    secret: process.env.EMAIL_SECRET,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
}
