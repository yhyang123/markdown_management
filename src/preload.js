const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("markdownManager", {
  getLibrary: () => ipcRenderer.invoke("library:get"),
  createDocument: (payload) => ipcRenderer.invoke("document:create", payload),
  updateDocument: (documentId, patch) => ipcRenderer.invoke("document:update", documentId, patch),
  deleteDocument: (documentId) => ipcRenderer.invoke("document:delete", documentId),
  importDocuments: (folderId) => ipcRenderer.invoke("document:import", folderId),
  importZip: () => ipcRenderer.invoke("library:import-zip"),
  exportLibraryZip: () => ipcRenderer.invoke("library:export-zip"),
  saveSource: (documentId) => ipcRenderer.invoke("document:save-source", documentId),
  exportDocument: (documentId) => ipcRenderer.invoke("document:export", documentId),
  createFolder: (payload) => ipcRenderer.invoke("folder:create", payload),
  updateFolder: (folderId, patch) => ipcRenderer.invoke("folder:update", folderId, patch),
  moveFolder: (folderId, targetParentId, targetIndex) => ipcRenderer.invoke("folder:move", folderId, targetParentId, targetIndex),
  deleteFolder: (folderId) => ipcRenderer.invoke("folder:delete", folderId),
  onLibraryChanged: (callback) => {
    const handler = (_event, library) => callback(library);
    ipcRenderer.on("library:changed", handler);
    return () => ipcRenderer.removeListener("library:changed", handler);
  },
  onMenuAction: (channel, callback) => {
    const allowedChannels = new Set([
      "menu:new-document",
      "menu:import-document",
      "menu:import-zip",
      "menu:export-library-zip"
    ]);

    if (!allowedChannels.has(channel)) {
      return () => {};
    }

    const handler = () => callback();
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  }
});
