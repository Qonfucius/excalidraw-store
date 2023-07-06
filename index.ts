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

// Création bucket scaleway

const client = new S3Client({
  endpoint: process.env.ENDPOINT,
  region: process.env.REGION,
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID as string,
    secretAccessKey: process.env.SECRET_ACCESS_KEY as string,
  },
});

//Tests fonctionnels + get -> permet d'avoir un body lisible

// PUT
/*
(async () => {
  const response = await client.send(new PutObjectCommand({Bucket: process.env.SCALEWAY_BUCKET_NAME,Key:"tata.txt", Body: "toto"}));
  console.log(response);
})();*/

//GET
/*
(async () => {
  const client = new S3Client({
    endpoint: process.env.ENDPOINT,
    region: process.env.REGION,
    credentials:{
      accessKeyId: process.env.ACCESS_KEY_ID as string,
      secretAccessKey: process.env.SECRET_ACCESS_KEY as string
    }
  });

  const streamToString = (stream: any) =>
      new Promise((resolve, reject) => {
        const chunks: any = [];
        stream.on("data", (chunk: any) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });

  const command = new GetObjectCommand({
    Bucket:  process.env.SCALEWAY_BUCKET_NAME,
    Key: "toto.txt",
  });

  const { Body } = await client.send(command);
  const bodyContents = await streamToString(Body);
  console.log(bodyContents);
})();
 */

const bucket = storage.bucket(BUCKET_NAME);

// Fonction permettant de savoir quel bucket est utilisé
function getStorageType() {
  if (
    (process.env.SCALEWAY_BUCKET_NAME,
    process.env.ENDPOINT,
    process.env.REGION,
    process.env.ACCESS_KEY_ID,
    process.env.SECRET_ACCESS_KEY)
  ) {
    const storageType = "S3";
    return storageType;
  } else {
    const storageType = "GCS";
    return storageType;
  }
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
  //Début essai nouvelle condition GET

  if (getStorageType() === "S3") {
    try {
      await (async () => {
        const streamToString = (stream: any) =>
          new Promise((resolve, reject) => {
            const chunks: any = [];
            stream.on("data", (chunk: any) => chunks.push(chunk));
            stream.on("error", reject);
            stream.on("end", () =>
              resolve(Buffer.concat(chunks).toString("utf8"))
            );
          });

        const key = req.params.key;

        const command = new GetObjectCommand({
          Bucket: process.env.SCALEWAY_BUCKET_NAME,
          Key: key, // Voir si ça marche pour key étant donné que j'ai juste repris le code d'en dessous
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

// Premier essai post mais le 2ème est peut-être plus "élégant" ?

/*app.post("/api/v2/post/", corsPost, (req, res) => {
  if (getStorageType() === "S3") {
    try {
    (async () => {
      const response = await client.send(new PutObjectCommand({Bucket: process.env.SCALEWAY_BUCKET_NAME,Key:"tata.txt", Body: "toto"}));
      console.log(response);
    })();
    }catch (error) {
      console.error(error);
      res.status(500).json({message: "Could not upload the data."});
    }

  } else {
    try {
      let fileSize = 0;
      const id = nanoid();
      const blob = bucket.file(id);
      const blobStream = blob.createWriteStream({resumable: false});

      blobStream.on("error", (error) => {
        console.error(error);
        res.status(500).json({message: error.message});
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
      res.status(500).json({message: "Could not upload the data."});
    }
  }
});*/

app.post("/api/v2/post/", corsPost, async (req, res) => {
  if (getStorageType() === "S3") {
    try {
      await uploadToS3(req); // devoir transmettre req ou res
      res.status(200).json({ message: "Data uploaded successfully." });
      console.log(res);
      console.log(req);
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
    const bucketName = process.env.SCALEWAY_BUCKET_NAME;
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: req.params.key, // RÉUSSIR À CONSOLE LOG REQ
      Body: req.params.body, // RÉUSSIR À CONSOLE LOG REQ
    });

    const response = await client.send(command);
    console.log(response);
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`http://localhost:${port}`));
