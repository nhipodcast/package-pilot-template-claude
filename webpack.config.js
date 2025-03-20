//@ts-check

"use strict";

const path = require("path");

/**@type {import('webpack').Configuration}*/
const extensionConfig = {
  target: "node", // VS Code extensions run in a Node.js-context
  mode: "production", // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

  entry: "./src/extension.ts", // the entry point of this extension
  output: {
    // the bundle is stored in the 'dist' folder (check package.json),
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
  },
  externals: {
    vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded
  },
  resolve: {
    // support reading TypeScript and JavaScript files
    extensions: [".ts", ".js", ".tsx", ".jsx"],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  devtool: "nosources-source-map",
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
};

/**@type {import('webpack').Configuration}*/
const webviewConfig = {
  target: "web",
  mode: "production",

  entry: "./src/ui/webview/index.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "webview.js",
  },
  resolve: {
    extensions: [".ts", ".js", ".tsx", ".jsx"],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  devtool: "nosources-source-map",
};

module.exports = [extensionConfig, webviewConfig];
