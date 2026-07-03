const express = require("express");
const multer = require("multer");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const AdmZip = require("adm-zip");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const libraryFile = path.join(dataDir, "library.json");

let libraryCache = null;
let server = null;

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "renderer")));

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function defaultLibrary() {
  return {
    folders: [{ id: "inbox", name: "未分类", parentId: null, order: 0, createdAt: new Date().toISOString() }],
    documents: []
  };
}

function normalizeLibrary(library) {
  const fallback = defaultLibrary();
  const rawFolders = Array.isArray(library.folders) && library.folders.length > 0 ? library.folders : fallback.folders;
  const rawFolderIds = new Set(rawFolders.map((folder) => folder.id));
  const folders = rawFolders.map((folder, index) => ({
    ...folder,
    parentId: rawFolderIds.has(folder.parentId) && folder.parentId !== folder.id ? folder.parentId : null,
    order: Number.isFinite(folder.order) ? folder.order : index
  }));
  const folderIds = new Set(folders.map((folder) => folder.id));
  const documents = (Array.isArray(library.documents) ? library.documents : []).map((document) => {
    return folderIds.has(document.folderId) ? document : { ...document, folderId: folders[0].id };
  });
  return { folders, documents };
}

async function ensureLibrary() {
  if (libraryCache) return libraryCache;
  await fs.mkdir(dataDir, { recursive: true });
  try {
    libraryCache = normalizeLibrary(JSON.parse(await fs.readFile(libraryFile, "utf8")));
  } catch {
    libraryCache = defaultLibrary();
    await saveLibrary();
  }
  return libraryCache;
}

async function saveLibrary() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(libraryFile, JSON.stringify(libraryCache, null, 2), "utf8");
}

function getSortedFolders(library) {
  return [...library.folders].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function getDefaultFolderId(library) {
  return getSortedFolders(library).find((folder) => !folder.parentId)?.id || library.folders[0].id;
}

function getDescendantFolderIds(library, folderId) {
  const ids = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of library.folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function sanitizePathSegment(value, fallback = "untitled") {
  const clean = String(value || "").trim().replace(/[/:*?"<>|\\]/g, "-").replace(/\s+/g, " ").replace(/^\.+$/, "");
  return clean || fallback;
}

function isMarkdownFile(filePath) {
  return [".md", ".markdown", ".mdown", ".mkd"].includes(path.extname(filePath).toLowerCase());
}

function getFolderPathSegments(library, folderId) {
  const foldersById = new Map(library.folders.map((folder) => [folder.id, folder]));
  const segments = [];
  const visited = new Set();
  let folder = foldersById.get(folderId);
  while (folder && !visited.has(folder.id)) {
    visited.add(folder.id);
    segments.unshift(sanitizePathSegment(folder.name, "folder"));
    folder = folder.parentId ? foldersById.get(folder.parentId) : null;
  }
  return segments;
}

function uniqueZipPath(basePath, usedPaths) {
  if (!usedPaths.has(basePath)) {
    usedPaths.add(basePath);
    return basePath;
  }
  const ext = path.posix.extname(basePath);
  const stem = basePath.slice(0, basePath.length - ext.length);
  let index = 2;
  while (usedPaths.has(`${stem}-${index}${ext}`)) index += 1;
  const next = `${stem}-${index}${ext}`;
  usedPaths.add(next);
  return next;
}

function getOrCreateFolderByPath(library, segments, createdAt) {
  let parentId = null;
  let folder = null;
  for (const segment of segments) {
    const name = sanitizePathSegment(segment, "folder");
    folder = getSortedFolders(library).find((item) => item.parentId === parentId && item.name === name);
    if (!folder) {
      folder = {
        id: createId("folder"),
        name,
        parentId,
        order: library.folders.filter((item) => item.parentId === parentId).length,
        createdAt
      };
      library.folders.push(folder);
    }
    parentId = folder.id;
  }
  return folder || library.folders.find((item) => item.id === getDefaultFolderId(library));
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.get("/api/library", asyncRoute(async (_req, res) => {
  res.json(await ensureLibrary());
}));

app.post("/api/documents", asyncRoute(async (req, res) => {
  const library = await ensureLibrary();
  const now = new Date().toISOString();
  const folderId = library.folders.some((folder) => folder.id === req.body.folderId) ? req.body.folderId : getDefaultFolderId(library);
  const document = { id: createId("doc"), folderId, title: String(req.body.title || "未命名文档").trim(), content: req.body.content || "", sourcePath: null, createdAt: now, updatedAt: now };
  library.documents.unshift(document);
  await saveLibrary();
  res.json(document);
}));

app.patch("/api/documents/:id", asyncRoute(async (req, res) => {
  const library = await ensureLibrary();
  const document = library.documents.find((item) => item.id === req.params.id);
  if (!document) return res.status(404).json({ message: "Document not found." });
  if (typeof req.body.title === "string") document.title = req.body.title.trim() || "未命名文档";
  if (typeof req.body.content === "string") document.content = req.body.content;
  if (typeof req.body.folderId === "string" && library.folders.some((folder) => folder.id === req.body.folderId)) document.folderId = req.body.folderId;
  document.updatedAt = new Date().toISOString();
  await saveLibrary();
  res.json(document);
}));

app.delete("/api/documents/:id", asyncRoute(async (req, res) => {
  const library = await ensureLibrary();
  const before = library.documents.length;
  library.documents = library.documents.filter((item) => item.id !== req.params.id);
  await saveLibrary();
  res.json({ deleted: library.documents.length !== before });
}));

app.get("/api/documents/:id/download", asyncRoute(async (req, res) => {
  const library = await ensureLibrary();
  const document = library.documents.find((item) => item.id === req.params.id);
  if (!document) return res.status(404).json({ message: "Document not found." });
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"${encodeURIComponent(sanitizePathSegment(document.title, "untitled"))}.md\"`);
  res.send(document.content || "");
}));

app.post("/api/documents/:id/save-source", asyncRoute(async (_req, res) => {
  res.json({ message: "Web 版数据已自动保存到 NAS 资料库。" });
}));

app.post("/api/folders", asyncRoute(async (req, res) => {
  const library = await ensureLibrary();
  const parentId = library.folders.some((folder) => folder.id === req.body.parentId) ? req.body.parentId : null;
  const folder = { id: createId("folder"), name: String(req.body.name || "").trim() || "新文件夹", parentId, order: library.folders.filter((item) => item.parentId === parentId).length, createdAt: new Date().toISOString() };
  library.folders.push(folder);
  await saveLibrary();
  res.json(folder);
}));

app.patch("/api/folders/:id", asyncRoute(async (req, res) => {
  const library = await ensureLibrary();
  const folder = library.folders.find((item) => item.id === req.params.id);
  if (!folder) return res.status(404).json({ message: "Folder not found." });
  if (typeof req.body.name === "string" && req.body.name.trim()) folder.name = req.body.name.trim();
  await saveLibrary();
  res.json(folder);
}));

app.post("/api/folders/:id/move", asyncRoute(async (req, res) => {
  const library = await ensureLibrary();
  const folder = library.folders.find((item) => item.id === req.params.id);
  const parentId = req.body.targetParentId || null;
  if (!folder) return res.status(404).json({ message: "Folder not found." });
  if (parentId === folder.id || (parentId && getDescendantFolderIds(library, folder.id).has(parentId))) return res.status(400).json({ message: "Folder cannot be moved into itself or its descendant." });
  const oldParentId = folder.parentId || null;
  folder.parentId = parentId;
  getSortedFolders(library).filter((item) => item.parentId === oldParentId && item.id !== folder.id).forEach((item, index) => { item.order = index; });
  const siblings = getSortedFolders(library).filter((item) => item.parentId === parentId && item.id !== folder.id);
  siblings.splice(Math.max(0, Math.min(Number(req.body.targetIndex) || 0, siblings.length)), 0, folder);
  siblings.forEach((item, index) => { item.order = index; });
  await saveLibrary();
  res.json(folder);
}));

app.delete("/api/folders/:id", asyncRoute(async (req, res) => {
  const library = await ensureLibrary();
  const deleteIds = getDescendantFolderIds(library, req.params.id);
  if (library.folders.length <= deleteIds.size) return res.status(400).json({ message: "At least one folder is required." });
  const fallbackFolder = getSortedFolders(library).find((item) => !deleteIds.has(item.id));
  library.folders = library.folders.filter((item) => !deleteIds.has(item.id));
  for (const document of library.documents) {
    if (deleteIds.has(document.folderId)) document.folderId = fallbackFolder.id;
  }
  await saveLibrary();
  res.json({ deleted: true, fallbackFolderId: fallbackFolder.id });
}));

app.post("/api/import/markdown", upload.array("files"), asyncRoute(async (req, res) => {
  const library = await ensureLibrary();
  const now = new Date().toISOString();
  const imported = [];
  const folderId = library.folders.some((folder) => folder.id === req.body.folderId)
    ? req.body.folderId
    : getDefaultFolderId(library);
  for (const file of req.files || []) {
    if (!isMarkdownFile(file.originalname)) continue;
    const parsed = path.parse(file.originalname);
    const document = { id: createId("doc"), folderId, title: parsed.name, content: file.buffer.toString("utf8"), sourcePath: null, createdAt: now, updatedAt: now };
    library.documents.unshift(document);
    imported.push(document);
  }
  await saveLibrary();
  res.json({ imported });
}));

app.post("/api/import/zip", upload.array("files", 1), asyncRoute(async (req, res) => {
  const file = req.files?.[0];
  if (!file) return res.json({ imported: [] });
  const zip = new AdmZip(file.buffer);
  const library = await ensureLibrary();
  const now = new Date().toISOString();
  const imported = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !isMarkdownFile(entry.entryName)) continue;
    const segments = entry.entryName.split("/").filter(Boolean);
    const fileName = segments.pop();
    const folder = getOrCreateFolderByPath(library, segments, now);
    const parsed = path.parse(fileName);
    const document = { id: createId("doc"), folderId: folder.id, title: parsed.name, content: entry.getData().toString("utf8"), sourcePath: null, createdAt: now, updatedAt: now };
    library.documents.unshift(document);
    imported.push(document);
  }
  await saveLibrary();
  res.json({ imported });
}));

app.get("/api/export/zip", asyncRoute(async (_req, res) => {
  const library = await ensureLibrary();
  const zip = new AdmZip();
  const used = new Set();
  for (const document of library.documents) {
    const zipPath = uniqueZipPath(path.posix.join(...getFolderPathSegments(library, document.folderId), `${sanitizePathSegment(document.title, "untitled")}.md`), used);
    zip.addFile(zipPath, Buffer.from(document.content || "", "utf8"));
  }
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename=\"markdown-manager-export.zip\"`);
  res.send(zip.toBuffer());
}));

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "renderer", "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: error.message || "Server error" });
});

server = app.listen(port, "0.0.0.0", () => {
  console.log(`Markdown Manager web server listening on http://0.0.0.0:${port}`);
  console.log(`Data directory: ${dataDir}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server?.close(() => process.exit(0));
  });
}
