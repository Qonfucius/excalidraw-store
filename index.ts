import { Storage } from "@google-cloud/storage";
import cors from "cors";
import express from "express";
import { nanoid } from "nanoid";
import favicon from "serve-favicon";
import {
  S3Client,
  PutObjectCommand,
  CreateBucketCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

import * as path from "path";

const SCALEWAY_BUCKET_NAME = "excalidraw-qonfucius";

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

/*const scalewayBucket = new S3Client({
  endpoint: process.env.ENDPOINT || "https://excalidraw-qonfucius.s3.fr-par.scw.cloud",
  region: process.env.REGION || "PAR",
  credentials: {
    accessKeyId: process.env.KEY_ID || "SCWMN65YHQH2RBY3XSVB",
    secretAccessKey: process.env.SECRET_KEY || "fbd2ad05-3113-4dd3-b579-3f440b18026d",
  },
});*/

// DÉBUT TENTATIVE

const client = new S3Client({});

export const main = async () => {
  const command = new CreateBucketCommand({
    Bucket: "excalidraw-qonfucius",
  });

  try {
    const { Location } = await client.send(command);
    console.log(`Bucket created with location ${Location}`);
  } catch (err) {
    console.error(err);
  }
};

//FIN TENTATIVE

const bucket = storage.bucket(BUCKET_NAME);
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
  //TENTATIVE GET DÉBUT

  if (SCALEWAY_BUCKET_NAME) {
    //const main = async () => {
    const command = new GetObjectCommand({
      Bucket: "excalidraw-qonfucius",
      Key: "fbd2ad05-3113-4dd3-b579-3f440b18026d",
    });

    try {
      const response = await client.send(command);
      const str = await res.Body.transformToString();
      console.log(str);
    } catch (err) {
      console.error(err);
    }
    //}
  } else {
    //TENTATIVE GET FIN
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

app.post("/api/v2/post/", corsPost, (req, res) => {
  //TENTATIVE PUT DÉBUT

  if (SCALEWAY_BUCKET_NAME) {
    //const main = async () => {
    const command = new PutObjectCommand({
      Bucket: "excalidraw-qonfucius",
      Key: "fbd2ad05-3113-4dd3-b579-3f440b18026d",
      Body: "??", //SAVOIR COMMENT FILER FICHIER JSON
    });

    try {
      const response = client.send(command);
      console.log(response);
    } catch (err) {
      console.error(err);
    }
    //}
  } else {
    //TENTATIVE PUT FIN

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
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`http://localhost:${port}`));
