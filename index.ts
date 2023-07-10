import { Storage } from "@google-cloud/storage";
import cors from "cors";
import express from "express";
import { nanoid } from "nanoid";
import favicon from "serve-favicon";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import * as path from "path";
import "dotenv/config";

const PROJECT_NAME = process.env.GOOGLE_CLOUD_PROJECT || "excalidraw-json-dev";
const PROD = PROJECT_NAME === "excalidraw-json";
const LOCAL = process.env.NODE_ENV !== "production";
const BUCKET_NAME = PROD
  ? "excalidraw-json.appspot.com"
  : "excalidraw-json-dev.appspot.com";

const FILE_SIZE_LIMIT = 2 * 1024 * 1024;
const storage = new Storage(
  LOCAL
    ? {
        projectId: PROJECT_NAME,
        keyFilename: `${__dirname}/keys/${PROJECT_NAME}.json`,
      }
    : undefined
);

const client = new S3Client({
  endpoint: process.env.ENDPOINT,
  region: process.env.REGION,
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID as string,
    secretAccessKey: process.env.SECRET_ACCESS_KEY as string,
  },
});

const bucket = storage.bucket(BUCKET_NAME);

const scalewayBucketConfig = {
  NAME: process.env.S3_BUCKET_NAME,
  ENDPOINT: process.env.ENDPOINT,
  REGION: process.env.REGION,
  KEY_ID: process.env.ACCESS_KEY_ID,
  ACCESS_KEY: process.env.SECRET_ACCESS_KEY,
};

function getStorageType() {
  return scalewayBucketConfig ? "S3" : "GCS";
}

const app = express();

let allowOrigins = [
  "excalidraw.vercel.app",
  "https://dai-shi.github.io",
  "https://excalidraw.com",
  "https://www.excalidraw.com",
];
if (!PROD) {
  allowOrigins.push("http://localhost:");
}

const corsGet = cors();
const corsPost = cors((req, callback) => {
  const origin = req.headers.origin;
  let isGood = false;
  if (origin) {
    for (const allowOrigin of allowOrigins) {
      if (origin.indexOf(allowOrigin) >= 0) {
        isGood = true;
        break;
      }
    }
  }
  callback(null, { origin: isGood });
});

app.use(favicon(path.join(__dirname, "favicon.ico")));
app.get("/", (req, res) => res.sendFile(`${process.cwd()}/index.html`));

app.get("/api/v2/:key", corsGet, async (req: any, res: any) => {
  if (getStorageType() === "S3") {
    try {
      await (async () => {
        function streamToString(stream: any) {
          return new Promise(function (resolve, reject) {
            const chunks: any = [];
            stream.on("data", function (chunk: any) {
              chunks.push(chunk);
            });
            stream.on("error", reject);
            stream.on("end", function () {
              resolve(Buffer.concat(chunks).toString("utf8"));
            });
          });
        }

        const key = req.params.key;

        const command = new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: key,
        });

        const { Body } = await client.send(command);
        const bodyContents = await streamToString(Body);
        console.log(bodyContents);
      })();
    } catch (error) {
      console.error(error);
      res.status(404).json({ message: "Could not find the file." });
    }
  } else if (getStorageType() === "GCS") {
    try {
      const key = req.params.key;
      const file = bucket.file(key);
      await file.getMetadata();
      res.status(200);
      res.setHeader("content-type", "application/octet-stream");
      file.createReadStream().pipe(res);
    } catch (error) {
      console.error(error);
      res.status(404).json({ message: "Could not find the file." });
    }
  }
});

app.post("/api/v2/post/", corsPost, async (req, res) => {
  if (getStorageType() === "S3") {
    try {
      await uploadToS3(req);
      res.status(200).json({ message: "Data uploaded successfully." });
      console.log(res);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Could not upload the data." });
      console.log(res);
    }
  } else if (getStorageType() === "GCS") {
    try {
      let fileSize = 0;
      const id = nanoid();
      const blob = bucket.file(id);
      const blobStream = blob.createWriteStream({ resumable: false });

      blobStream.on("error", (error) => {
        console.error(error);
        res.status(500).json({ message: error.message });
      });

      blobStream.on("finish", async () => {
        res.status(200).json({
          id,
          data: `${LOCAL ? "http" : "https"}://${req.get("host")}/api/v2/${id}`,
        });
      });

      req.on("data", (chunk) => {
        blobStream.write(chunk);
        fileSize += chunk.length;
        if (fileSize > FILE_SIZE_LIMIT) {
          const error = {
            message: "Data is too large.",
            max_limit: FILE_SIZE_LIMIT,
          };
          blobStream.destroy();
          console.error(error);
          return res.status(413).json(error);
        }
      });
      req.on("end", () => {
        blobStream.end();
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Could not upload the data." });
    }
  }

  async function uploadToS3(req: any) {
    const bucketName = process.env.S3_BUCKET_NAME;
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: req.params.key,
      Body: req.params.body,
    });

    const response = await client.send(command);
    console.log(response);
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`http://localhost:${port}`));
