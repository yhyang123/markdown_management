const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const AdmZip = require("adm-zip");

let mainWindow;
let libraryFile;
let libraryCache;

const defaultLibrary = () => ({
  folders: [
    {
      id: "inbox",
      name: "未分类",
      createdAt: new Date().toISOString()
    }
  ],
  documents: []
});

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

async function ensureLibrary() {
  if (libraryCache) {
    return libraryCache;
  }

  const dataDir = app.getPath("userData");
  await fs.mkdir(dataDir, { recursive: true });
  libraryFile = path.join(dataDir, "library.json");

  try {
    const raw = await fs.readFile(libraryFile, "utf8");
    libraryCache = normalizeLibrary(JSON.parse(raw));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Could not read library, creating a clean one.", error);
    }
    libraryCache = defaultLibrary();
    await saveLibrary();
  }

  return libraryCache;
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
  const documents = (Array.isArray(library.documents) ? library.documents : fallback.documents).map((document) => {
    if (folderIds.has(document.folderId)) {
      return document;
    }
    return { ...document, folderId: folders[0].id };
  });

  return { folders, documents };
}

function getDefaultFolderId(library) {
  return getSortedFolders(library).find((folder) => !folder.parentId)?.id || library.folders[0]?.id || "inbox";
}

function getSortedFolders(library) {
  return [...library.folders].sort((first, second) => {
    const firstOrder = Number.isFinite(first.order) ? first.order : 0;
    const secondOrder = Number.isFinite(second.order) ? second.order : 0;
    if (firstOrder !== secondOrder) {
      return firstOrder - secondOrder;
    }
    return String(first.createdAt || "").localeCompare(String(second.createdAt || ""));
  });
}

function getFolderChildren(library, parentId) {
  return getSortedFolders(library).filter((folder) => (folder.parentId || null) === (parentId || null));
}

function sanitizePathSegment(value, fallback = "untitled") {
  const clean = String(value || "")
    .trim()
    .replace(/[/:*?"<>|\\]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+$/, "");
  return clean || fallback;
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

function createUniqueZipPath(basePath, usedPaths) {
  if (!usedPaths.has(basePath)) {
    usedPaths.add(basePath);
    return basePath;
  }

  const ext = path.posix.extname(basePath);
  const withoutExt = basePath.slice(0, basePath.length - ext.length);
  let index = 2;

  while (usedPaths.has(`${withoutExt}-${index}${ext}`)) {
    index += 1;
  }

  const nextPath = `${withoutExt}-${index}${ext}`;
  usedPaths.add(nextPath);
  return nextPath;
}

function isMarkdownFile(filePath) {
  return [".md", ".markdown", ".mdown", ".mkd"].includes(path.extname(filePath).toLowerCase());
}

function getOrCreateFolderByPath(library, segments, createdAt) {
  let parentId = null;
  let folder = null;

  for (const segment of segments) {
    const name = sanitizePathSegment(segment, "folder");
    folder = getSortedFolders(library).find((item) => item.parentId === parentId && item.name === name);

    if (!folder) {
      const siblingCount = library.folders.filter((item) => item.parentId === parentId).length;
      folder = {
        id: createId("folder"),
        name,
        parentId,
        order: siblingCount,
        createdAt
      };
      library.folders.push(folder);
    }

    parentId = folder.id;
  }

  return folder || library.folders.find((item) => item.id === getDefaultFolderId(library));
}

async function saveLibrary() {
  if (!libraryFile) {
    libraryFile = path.join(app.getPath("userData"), "library.json");
  }
  await fs.writeFile(libraryFile, JSON.stringify(libraryCache, null, 2), "utf8");
}

async function sendLibraryChanged() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("library:changed", await ensureLibrary());
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: "Markdown Manager",
    backgroundColor: "#f6f4ef",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function createAppMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "文件",
      submenu: [
        {
          label: "新建 Markdown",
          accelerator: "CmdOrCtrl+N",
          click: () => mainWindow?.webContents.send("menu:new-document")
        },
        {
          label: "导入 Markdown...",
          accelerator: "CmdOrCtrl+O",
          click: () => mainWindow?.webContents.send("menu:import-document")
        },
        {
          label: "导入 ZIP...",
          click: () => mainWindow?.webContents.send("menu:import-zip")
        },
        {
          label: "导出全部为 ZIP...",
          click: () => mainWindow?.webContents.send("menu:export-library-zip")
        },
        { role: "close" }
      ]
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" }
      ]
    },
    {
      label: "视图",
      submenu: [
        { role: "reload", label: "重新载入" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "进入全屏" }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle("library:get", async () => ensureLibrary());

ipcMain.handle("document:create", async (_event, payload) => {
  const library = await ensureLibrary();
  const now = new Date().toISOString();
  const folderId = library.folders.some((folder) => folder.id === payload?.folderId)
    ? payload.folderId
    : getDefaultFolderId(library);
  const document = {
    id: createId("doc"),
    folderId,
    title: payload?.title?.trim() || "未命名文档",
    content: payload?.content || "",
    sourcePath: null,
    createdAt: now,
    updatedAt: now
  };

  library.documents.unshift(document);
  await saveLibrary();
  await sendLibraryChanged();
  return document;
});

ipcMain.handle("document:update", async (_event, documentId, patch) => {
  const library = await ensureLibrary();
  const document = library.documents.find((item) => item.id === documentId);

  if (!document) {
    throw new Error("Document not found.");
  }

  if (typeof patch.title === "string") {
    document.title = patch.title.trim() || "未命名文档";
  }
  if (typeof patch.content === "string") {
    document.content = patch.content;
  }
  if (typeof patch.folderId === "string" && library.folders.some((folder) => folder.id === patch.folderId)) {
    document.folderId = patch.folderId;
  }

  document.updatedAt = new Date().toISOString();
  await saveLibrary();
  return document;
});

ipcMain.handle("document:delete", async (_event, documentId) => {
  const library = await ensureLibrary();
  const previousLength = library.documents.length;
  library.documents = library.documents.filter((item) => item.id !== documentId);
  await saveLibrary();
  await sendLibraryChanged();
  return { deleted: library.documents.length !== previousLength };
});

ipcMain.handle("document:import", async (_event, targetFolderId) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "导入 Markdown 文件",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }

  const library = await ensureLibrary();
  const now = new Date().toISOString();
  const imported = [];
  const folderId = library.folders.some((folder) => folder.id === targetFolderId)
    ? targetFolderId
    : getDefaultFolderId(library);

  for (const filePath of result.filePaths) {
    const content = await fs.readFile(filePath, "utf8");
    const parsedPath = path.parse(filePath);
    const document = {
      id: createId("doc"),
      folderId,
      title: parsedPath.name || "未命名文档",
      content,
      sourcePath: filePath,
      createdAt: now,
      updatedAt: now
    };
    library.documents.unshift(document);
    imported.push(document);
  }

  await saveLibrary();
  await sendLibraryChanged();
  return imported;
});

ipcMain.handle("document:save-source", async (_event, documentId) => {
  const library = await ensureLibrary();
  const document = library.documents.find((item) => item.id === documentId);

  if (!document) {
    throw new Error("Document not found.");
  }

  if (!document.sourcePath) {
    return saveDocumentAs(document);
  }

  await fs.writeFile(document.sourcePath, document.content, "utf8");
  document.updatedAt = new Date().toISOString();
  await saveLibrary();
  await sendLibraryChanged();
  return { filePath: document.sourcePath };
});

ipcMain.handle("document:export", async (_event, documentId) => {
  const library = await ensureLibrary();
  const document = library.documents.find((item) => item.id === documentId);

  if (!document) {
    throw new Error("Document not found.");
  }

  return saveDocumentAs(document);
});

async function saveDocumentAs(document) {
  const defaultName = `${document.title || "untitled"}.md`.replace(/[/:*?"<>|]/g, "-");
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "保存 Markdown 文件",
    defaultPath: defaultName,
    filters: [{ name: "Markdown", extensions: ["md"] }]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  await fs.writeFile(result.filePath, document.content, "utf8");
  document.sourcePath = result.filePath;
  document.updatedAt = new Date().toISOString();
  await saveLibrary();
  await sendLibraryChanged();
  return { filePath: result.filePath };
}

ipcMain.handle("folder:create", async (_event, name) => {
  const library = await ensureLibrary();
  const folderName = typeof name === "object" ? String(name.name || "").trim() : String(name || "").trim();
  const parentId = typeof name === "object" && library.folders.some((folder) => folder.id === name.parentId)
    ? name.parentId
    : null;

  if (!folderName) {
    throw new Error("Folder name is required.");
  }

  const folder = {
    id: createId("folder"),
    name: folderName,
    parentId,
    order: library.folders.filter((item) => item.parentId === parentId).length,
    createdAt: new Date().toISOString()
  };

  library.folders.push(folder);
  await saveLibrary();
  await sendLibraryChanged();
  return folder;
});

ipcMain.handle("folder:update", async (_event, folderId, patch) => {
  const library = await ensureLibrary();
  const folder = library.folders.find((item) => item.id === folderId);

  if (!folder) {
    throw new Error("Folder not found.");
  }

  if (typeof patch.name === "string" && patch.name.trim()) {
    folder.name = patch.name.trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "parentId")) {
    const nextParentId = patch.parentId || null;
    if (nextParentId === folder.id) {
      throw new Error("Folder cannot be moved into itself.");
    }
    if (nextParentId && !library.folders.some((item) => item.id === nextParentId)) {
      throw new Error("Parent folder not found.");
    }
    if (nextParentId && getDescendantFolderIds(library, folder.id).has(nextParentId)) {
      throw new Error("Folder cannot be moved into its descendant.");
    }
    folder.parentId = nextParentId;
  }

  await saveLibrary();
  await sendLibraryChanged();
  return folder;
});

ipcMain.handle("folder:move", async (_event, folderId, targetParentId, targetIndex) => {
  const library = await ensureLibrary();
  const folder = library.folders.find((item) => item.id === folderId);
  const previousParentId = folder?.parentId || null;
  const parentId = targetParentId || null;

  if (!folder) {
    throw new Error("Folder not found.");
  }
  if (parentId && !library.folders.some((item) => item.id === parentId)) {
    throw new Error("Parent folder not found.");
  }
  if (parentId === folderId || (parentId && getDescendantFolderIds(library, folderId).has(parentId))) {
    throw new Error("Folder cannot be moved into itself or its descendant.");
  }

  folder.parentId = parentId;
  getSortedFolders(library)
    .filter((item) => item.parentId === previousParentId && item.id !== folderId)
    .forEach((item, index) => {
      item.order = index;
    });
  const siblings = getSortedFolders(library).filter((item) => item.parentId === parentId && item.id !== folderId);
  const safeIndex = Math.max(0, Math.min(Number(targetIndex) || 0, siblings.length));
  siblings.splice(safeIndex, 0, folder);
  siblings.forEach((item, index) => {
    item.order = index;
  });

  await saveLibrary();
  await sendLibraryChanged();
  return folder;
});

ipcMain.handle("folder:delete", async (_event, folderId) => {
  const library = await ensureLibrary();
  const folder = library.folders.find((item) => item.id === folderId);

  if (!folder) {
    throw new Error("Folder not found.");
  }

  if (library.folders.length <= 1) {
    throw new Error("At least one folder is required.");
  }

  const deleteIds = getDescendantFolderIds(library, folderId);
  if (library.folders.length <= deleteIds.size) {
    throw new Error("At least one folder is required.");
  }
  const fallbackFolder = getSortedFolders(library).find((item) => !deleteIds.has(item.id));
  library.folders = library.folders.filter((item) => !deleteIds.has(item.id));
  for (const document of library.documents) {
    if (deleteIds.has(document.folderId)) {
      document.folderId = fallbackFolder.id;
      document.updatedAt = new Date().toISOString();
    }
  }

  await saveLibrary();
  await sendLibraryChanged();
  return { deleted: true, fallbackFolderId: fallbackFolder.id };
});

ipcMain.handle("library:export-zip", async () => {
  const library = await ensureLibrary();
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "导出全部 Markdown 为 ZIP",
    defaultPath: `Markdown Manager Export ${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ name: "ZIP", extensions: ["zip"] }]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  const zip = new AdmZip();
  const usedPaths = new Set();

  for (const document of library.documents) {
    const folderSegments = getFolderPathSegments(library, document.folderId);
    const fileName = `${sanitizePathSegment(document.title, "untitled")}.md`;
    const zipPath = createUniqueZipPath(path.posix.join(...folderSegments, fileName), usedPaths);
    zip.addFile(zipPath, Buffer.from(document.content || "", "utf8"));
  }

  await fs.writeFile(result.filePath, zip.toBuffer());
  return { filePath: result.filePath, count: library.documents.length };
});

ipcMain.handle("library:import-zip", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "导入 ZIP 文件",
    properties: ["openFile"],
    filters: [
      { name: "ZIP", extensions: ["zip"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { imported: [] };
  }

  const zip = new AdmZip(result.filePaths[0]);
  const library = await ensureLibrary();
  const now = new Date().toISOString();
  const imported = [];

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !isMarkdownFile(entry.entryName)) {
      continue;
    }

    const segments = entry.entryName.split("/").filter(Boolean);
    const fileName = segments.pop();
    const folder = getOrCreateFolderByPath(library, segments, now);
    const parsedPath = path.parse(fileName);
    const document = {
      id: createId("doc"),
      folderId: folder.id,
      title: parsedPath.name || "未命名文档",
      content: entry.getData().toString("utf8"),
      sourcePath: null,
      createdAt: now,
      updatedAt: now
    };

    library.documents.unshift(document);
    imported.push(document);
  }

  await saveLibrary();
  await sendLibraryChanged();
  return { imported };
});

app.whenReady().then(async () => {
  await ensureLibrary();
  await createWindow();
  createAppMenu();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
