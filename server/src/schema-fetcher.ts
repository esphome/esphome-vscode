import path = require("path");
import * as unzipper from "unzipper";
import * as https from "https";
import * as os from "os";
import * as fs from "fs";
import { version } from "./ESPHomeConnectionSource";

const SCHEMA_REPOSITORY = "esphome/esphome-schema";

function getSchemaTags(): Promise<any> {
  const schemaTags = `https://api.github.com/repos/${SCHEMA_REPOSITORY}/git/matching-refs/tags`;
  console.log(`Retrieving schema metadata from ` + schemaTags);
  return new Promise((resolve, reject) => {
    https
      .get(
        schemaTags,
        {
          headers: {
            "User-Agent": "esphome-vscode-extension",
            Accept: "application/vnd.github.v3.raw",
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (e) {
              reject(e);
            }
          });
        },
      )
      .on("error", reject);
  });
}

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

function semverCompare(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

async function getSuitableTag(): Promise<string> {
  const connection_version = await version();

  console.log(`Connected version: ${connection_version}. Matching schema`);
  if (connection_version.endsWith("dev")) {
    return "dev";
  }

  const schemaTags = await getSchemaTags();

  // Extract just the version strings
  const versions = schemaTags.map((tag: any) => {
    const ref = tag.ref;
    return ref.substring(ref.lastIndexOf("/") + 1);
  });

  // Sort versions using semver rules
  versions.sort((a: string, b: string) => semverCompare(a, b));

  // Try to find exact match
  if (versions.includes(connection_version)) {
    return connection_version;
  }

  // Find the next newer
  const newer = versions.find(
    (v: string) => semverCompare(v, connection_version) > 0,
  );
  if (newer) return newer;

  // Else, find the latest lower
  const older = [...versions]
    .reverse()
    .find((v) => semverCompare(v, connection_version) < 0);
  if (older) return older;

  throw new Error("No suitable schema tag found");
}

var schemaAvailablePromise: Promise<string>;
export function ensureSchemaAvailable(): Promise<string> {
  if (schemaAvailablePromise == undefined) {
    schemaAvailablePromise = new Promise((resolve, reject) => {
      getSuitableTag().then((tag) => {
        const baseDir = getBaseDir();
        const schemaPath = path.join(baseDir, `esphome-schema-${tag}`);
        if (fs.existsSync(schemaPath) && tag !== "dev") {
          console.log(`Using cached schema at ${schemaPath}`);
          resolve(schemaPath);
          return;
        }

        const cachePath = path.join(baseDir, "schemas");
        const zipPath = path.join(cachePath, tag + ".zip");
        const download_url =
          tag == "dev"
            ? `https://github.com/${SCHEMA_REPOSITORY}/archive/refs/heads/dev.zip`
            : `https://github.com/${SCHEMA_REPOSITORY}/archive/refs/tags/${tag}.zip`;
        console.log(`Downloading ${download_url} to ${zipPath}`);
        fs.mkdirSync(cachePath, { recursive: true });
        downloadFile(download_url, zipPath)
          .then(() => {
            console.log("Schema zip downloaded. Extracting...");
            unzip(zipPath, baseDir)
              .then(() => {
                fs.rmSync(zipPath);
                console.log(`Extract completed. Using schema at ${schemaPath}`);
                resolve(schemaPath);
              })
              .catch(reject);
          })
          .catch(reject);
      });
    });
  }
  return schemaAvailablePromise;
}
