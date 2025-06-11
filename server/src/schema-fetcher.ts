import path = require("path");
import * as unzipper from "unzipper";
import * as https from "https";
import * as os from "os";
import * as fs from "fs";
import { version } from "./ESPHomeConnectionSource";

function getBaseDir(): string {
  const base = path.join(os.homedir(), ".esphome-language-server");
  fs.mkdirSync(base, { recursive: true });
  return base;
}
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "esphome-vscode-extension",
          Accept: "application/vnd.github.v3.raw",
        },
      },
      (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            return downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          } else {
            return reject(new Error("Redirected but no Location header found"));
          }
        }

        if (res.statusCode !== 200) {
          return reject(
            new Error(`Failed to download file: ${res.statusCode}`),
          );
        }

        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () =>
          file.close((err) => {
            if (err) reject(err);
            else resolve();
          }),
        );
      },
    );

    request.on("error", reject);
  });
}

function unzip(zipFile: string, dest: string): Promise<void> {
  return fs
    .createReadStream(zipFile)
    .pipe(unzipper.Extract({ path: dest }))
    .promise();
}

const tryDownloadSchemaTag = async (tag: string): Promise<string> => {
  const zipPath = path.join(getBaseDir(), tag + ".zip");
  const url = `https://schema.esphome.io/${tag}/schema.zip`;
  console.log(`Downloading ${url} to ${zipPath}`);
  await downloadFile(url, zipPath);
  const schemaPath = path.join(getBaseDir(), tag);
  await unzip(zipPath, schemaPath);
  fs.rmSync(zipPath);
  return schemaPath;
};

const retrieveSchema = async (): Promise<string> => {
  const connected_version = await version();
  let tag = connected_version.endsWith("dev") ? "dev" : connected_version;
  const baseDir = getBaseDir();
  fs.mkdirSync(baseDir, { recursive: true });
  let schemaPath = path.join(baseDir, tag);
  if (fs.existsSync(schemaPath) && tag !== "dev") {
    console.log(`Using cached schema at ${schemaPath}`);
    return schemaPath;
  }

  // Attempt download specific version
  try {
    return await tryDownloadSchemaTag(tag);
  } catch (err) {
    // fallback to dev
    return await tryDownloadSchemaTag("dev");
  }
};

let schemaAvailablePromise: Promise<string>;

export function ensureSchemaAvailable(): Promise<string> {
  if (!schemaAvailablePromise) {
    schemaAvailablePromise = (async () => {
      return await retrieveSchema();
    })();
  }
  return schemaAvailablePromise;
}
