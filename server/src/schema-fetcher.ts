import path = require("path");
import * as unzipper from "unzipper";
import * as https from "https";
import * as os from "os";
import * as fs from "fs";

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
        }
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
            new Error(`Failed to download file: ${res.statusCode}`)
          );
        }

        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () =>
          file.close((err) => {
            if (err) reject(err);
            else resolve();
          })
        );
      }
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

function getSuitableTag(schemaTags: any): string {
  // TODO: Match with connected ESPHome version
  // just get latest on the list
  const tagRef = schemaTags[schemaTags.length - 1].ref;
  const tag = tagRef.substring(tagRef.lastIndexOf("/") + 1);
  return tag;
}

var schemaAvailablePromise: Promise<string>;
export function ensureSchemaAvailable(): Promise<string> {
  if (schemaAvailablePromise == undefined) {
    schemaAvailablePromise = new Promise((resolve, reject) => {
      getSchemaTags().then((schemaTags) => {
        const tag = getSuitableTag(schemaTags);
        console.log("Using schema tag " + tag);
        const baseDir = getBaseDir();
        const schemaPath = path.join(baseDir, `esphome-schema-${tag}`);
        if (fs.existsSync(schemaPath)) {
          console.log(`Using cached schema at ${schemaPath}`);
          resolve(schemaPath);
          return;
        }

        const cachePath = path.join(baseDir, "schemas");
        const zipPath = path.join(cachePath, tag + ".zip");
        console.log(`Downloading to ${zipPath}`);
        fs.mkdirSync(cachePath, { recursive: true });
        downloadFile(
          `https://github.com/${SCHEMA_REPOSITORY}/archive/refs/tags/${tag}.zip`,
          zipPath
        )
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
