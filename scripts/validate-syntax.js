const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const files = [
  "src/main.js",
  "src/preload.js",
  "src/web-server.js",
  "src/renderer/app.js",
  "src/renderer/web-adapter.js"
];

for (const file of files) {
  const absolutePath = path.join(process.cwd(), file);
  const source = fs.readFileSync(absolutePath, "utf8");
  new vm.Script(source, { filename: file });
  console.log(`ok ${file}`);
}

const styles = fs.readFileSync(path.join(process.cwd(), "src/renderer/styles.css"), "utf8");
const requiredScrollRules = [
  [".editor-surface", "overflow: hidden"],
  [".editor-grid", "overflow: hidden"],
  ["textarea", "overflow: auto"],
  [".markdown-preview", "overflow: auto"]
];

for (const [selector, declaration] of requiredScrollRules) {
  const selectorIndex = styles.indexOf(selector);
  const declarationIndex = styles.indexOf(declaration, selectorIndex);
  if (selectorIndex === -1 || declarationIndex === -1) {
    throw new Error(`Missing required scroll rule: ${selector} { ${declaration}; }`);
  }
}

console.log("ok src/renderer/styles.css");

const renderer = fs.readFileSync(path.join(process.cwd(), "src/renderer/app.js"), "utf8");
if (renderer.includes("window.prompt") || renderer.includes("prompt(")) {
  throw new Error("Native prompt is not allowed; use the in-app text dialog instead.");
}

const requiredMenuLabels = [
  "新增文档",
  "新增文件夹",
  "重命名文件夹",
  "删除文件夹",
  "重命名",
  "删除"
];

for (const label of requiredMenuLabels) {
  if (!renderer.includes(label)) {
    throw new Error(`Missing context menu label: ${label}`);
  }
}

console.log("ok context menu labels");

const html = fs.readFileSync(path.join(process.cwd(), "src/renderer/index.html"), "utf8");
const requiredLayoutElements = [
  "editorResizeHandle",
  "toggleEditorButton",
  "resize-handle",
  "sidebarResizeHandle",
  "importZipButton",
  "exportZipButton",
  "./vendor/dompurify/purify.min.js",
  "./vendor/marked/marked.min.js",
  "./web-adapter.js"
];

for (const marker of requiredLayoutElements) {
  if (!html.includes(marker) && !renderer.includes(marker) && !styles.includes(marker)) {
    throw new Error(`Missing editor layout marker: ${marker}`);
  }
}

console.log("ok editor layout controls");

const main = fs.readFileSync(path.join(process.cwd(), "src/main.js"), "utf8");
for (const marker of ["library:export-zip", "library:import-zip", "folder:move", "AdmZip"]) {
  if (!main.includes(marker)) {
    throw new Error(`Missing main process ZIP/tree marker: ${marker}`);
  }
}

console.log("ok zip and tree ipc");

const packageJson = fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8");
const packageData = JSON.parse(packageJson);
if (!packageJson.includes("node_modules/adm-zip/**/*")) {
  throw new Error("adm-zip must be included in electron-builder files.");
}
if (!packageData.version) {
  throw new Error("package.json must declare a version.");
}
for (const marker of ['"web": "node src/web-server.js"', '"express"', '"multer"']) {
  if (!packageJson.includes(marker)) {
    throw new Error(`Missing package marker: ${marker}`);
  }
}

console.log("ok package runtime files");

const webServer = fs.readFileSync(path.join(process.cwd(), "src/web-server.js"), "utf8");
for (const marker of ["process.env.DATA_DIR", "/api/library", "/api/import/zip", "/api/export/zip"]) {
  if (!webServer.includes(marker)) {
    throw new Error(`Missing web server marker: ${marker}`);
  }
}

console.log("ok nas web server");

for (const file of [
  "src/renderer/vendor/dompurify/purify.min.js",
  "src/renderer/vendor/marked/marked.min.js",
  "Dockerfile",
  "docker-compose.yml"
]) {
  if (!fs.existsSync(path.join(process.cwd(), file))) {
    throw new Error(`Missing deployment asset: ${file}`);
  }
}

console.log("ok deployment assets");
