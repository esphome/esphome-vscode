//@ts-check

"use strict";

const withDefaults = require("../shared.webpack.config");
const path = require("path");

module.exports = withDefaults({
  context: path.join(__dirname),
  entry: {
    extension: "./src/server.ts",
  },
  output: {
    filename: "server.js",
    path: path.join(__dirname, "out"),
  },
  externals: {
    bufferutil: "bufferutil",
    "utf-8-validate": "utf-8-validate",
  },
  resolve: {
    fallback: {
      "@aws-sdk/client-s3": false,
    },
  },
});
