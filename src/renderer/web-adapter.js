(function () {
  if (window.markdownManager) {
    return;
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || "请求失败");
    }

    return response.json();
  }

  function uploadFiles(url, accept, multiple, fields = {}) {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.multiple = multiple;
      input.addEventListener("change", async () => {
        if (!input.files || input.files.length === 0) {
          resolve(multiple ? [] : { imported: [] });
          return;
        }

        const formData = new FormData();
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined && value !== null) {
            formData.append(key, value);
          }
        }
        for (const file of input.files) {
          formData.append("files", file);
        }

        try {
          const response = await fetch(url, {
            method: "POST",
            body: formData
          });
          if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || "上传失败");
          }
          resolve(await response.json());
        } catch (error) {
          reject(error);
        }
      });
      input.click();
    });
  }

  window.markdownManager = {
    getLibrary: () => requestJson("/api/library"),
    createDocument: (payload) => requestJson("/api/documents", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
    updateDocument: (documentId, patch) => requestJson(`/api/documents/${encodeURIComponent(documentId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
    deleteDocument: (documentId) => requestJson(`/api/documents/${encodeURIComponent(documentId)}`, {
      method: "DELETE"
    }),
    importDocuments: async (folderId) => {
      const result = await uploadFiles("/api/import/markdown", ".md,.markdown,.mdown,.mkd", true, { folderId });
      return result.imported || [];
    },
    importZip: () => uploadFiles("/api/import/zip", ".zip", false),
    exportLibraryZip: async () => {
      window.location.href = "/api/export/zip";
      return { filePath: "浏览器下载目录", count: 0 };
    },
    saveSource: (documentId) => requestJson(`/api/documents/${encodeURIComponent(documentId)}/save-source`, {
      method: "POST"
    }),
    exportDocument: async (documentId) => {
      window.location.href = `/api/documents/${encodeURIComponent(documentId)}/download`;
      return { filePath: "浏览器下载目录" };
    },
    createFolder: (payload) => requestJson("/api/folders", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
    updateFolder: (folderId, patch) => requestJson(`/api/folders/${encodeURIComponent(folderId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
    moveFolder: (folderId, targetParentId, targetIndex) => requestJson(`/api/folders/${encodeURIComponent(folderId)}/move`, {
      method: "POST",
      body: JSON.stringify({ targetParentId, targetIndex })
    }),
    deleteFolder: (folderId) => requestJson(`/api/folders/${encodeURIComponent(folderId)}`, {
      method: "DELETE"
    }),
    onLibraryChanged: () => () => {},
    onMenuAction: () => () => {}
  };
})();
