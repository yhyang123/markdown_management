const api = window.markdownManager;

const state = {
  library: { folders: [], documents: [] },
  activeFolderId: "inbox",
  activeDocumentId: null,
  search: "",
  expandedFolderIds: new Set(["inbox"]),
  draggedFolderId: null,
  saveTimer: null,
  toastTimer: null
};

const els = {
  libraryCount: document.getElementById("libraryCount"),
  folderList: document.getElementById("folderList"),
  searchInput: document.getElementById("searchInput"),
  newDocumentButton: document.getElementById("newDocumentButton"),
  emptyNewButton: document.getElementById("emptyNewButton"),
  importButton: document.getElementById("importButton"),
  importZipButton: document.getElementById("importZipButton"),
  exportZipButton: document.getElementById("exportZipButton"),
  addFolderButton: document.getElementById("addFolderButton"),
  sidebarToggleButton: document.getElementById("sidebarToggleButton"),
  sidebarResizeHandle: document.getElementById("sidebarResizeHandle"),
  contextMenu: document.getElementById("contextMenu"),
  textDialogOverlay: document.getElementById("textDialogOverlay"),
  textDialog: document.getElementById("textDialog"),
  textDialogTitle: document.getElementById("textDialogTitle"),
  textDialogInput: document.getElementById("textDialogInput"),
  textDialogError: document.getElementById("textDialogError"),
  textDialogCancel: document.getElementById("textDialogCancel"),
  emptyState: document.getElementById("emptyState"),
  editorSurface: document.getElementById("editorSurface"),
  editorGrid: document.querySelector(".editor-grid"),
  editorResizeHandle: document.getElementById("editorResizeHandle"),
  titleInput: document.getElementById("titleInput"),
  sourcePathLabel: document.getElementById("sourcePathLabel"),
  folderSelect: document.getElementById("folderSelect"),
  saveSourceButton: document.getElementById("saveSourceButton"),
  exportButton: document.getElementById("exportButton"),
  deleteButton: document.getElementById("deleteButton"),
  markdownInput: document.getElementById("markdownInput"),
  preview: document.getElementById("preview"),
  saveStatus: document.getElementById("saveStatus"),
  toggleEditorButton: document.getElementById("toggleEditorButton"),
  copyHtmlButton: document.getElementById("copyHtmlButton")
};

const starterMarkdown = `# 新文档

在这里输入或粘贴 Markdown 内容，右侧会自动渲染。

## 示例

- 支持列表
- 支持 **粗体** 和 *斜体*
- 支持代码块

\`\`\`js
console.log("Hello Markdown");
\`\`\`
`;

loadExpandedFolders();
loadEditorLayout();
loadSidebarLayout();

function getActiveDocument() {
  return state.library.documents.find((item) => item.id === state.activeDocumentId) || null;
}

function getFolderName(folderId) {
  const folder = state.library.folders.find((item) => item.id === folderId);
  return folder?.name || "未分类";
}

function getDocumentsInFolder(folderId) {
  const search = state.search.trim().toLowerCase();
  return state.library.documents
    .filter((item) => {
      const matchesFolder = item.folderId === folderId;
      const matchesSearch =
        !search ||
        item.title.toLowerCase().includes(search) ||
        item.content.toLowerCase().includes(search);
      return matchesFolder && matchesSearch;
    })
    .sort((first, second) => new Date(second.updatedAt) - new Date(first.updatedAt));
}

function getSortedFolders() {
  return [...state.library.folders].sort((first, second) => {
    const firstOrder = Number.isFinite(first.order) ? first.order : 0;
    const secondOrder = Number.isFinite(second.order) ? second.order : 0;
    if (firstOrder !== secondOrder) {
      return firstOrder - secondOrder;
    }
    return String(first.createdAt || "").localeCompare(String(second.createdAt || ""));
  });
}

function getChildFolders(parentId) {
  return getSortedFolders().filter((folder) => (folder.parentId || null) === (parentId || null));
}

function getDescendantFolderIds(folderId) {
  const ids = new Set([folderId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const folder of state.library.folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }

  return ids;
}

function getVisibleDocumentCount() {
  const search = state.search.trim().toLowerCase();
  if (!search) {
    return state.library.documents.length;
  }

  return state.library.documents.filter((item) => {
    return item.title.toLowerCase().includes(search) || item.content.toLowerCase().includes(search);
  }).length;
}

function loadExpandedFolders() {
  try {
    const raw = window.localStorage.getItem("markdown-manager-expanded-folders");
    const folderIds = raw ? JSON.parse(raw) : [];
    if (Array.isArray(folderIds) && folderIds.length > 0) {
      state.expandedFolderIds = new Set(folderIds);
    }
  } catch {
    state.expandedFolderIds = new Set(["inbox"]);
  }
}

function saveExpandedFolders() {
  window.localStorage.setItem(
    "markdown-manager-expanded-folders",
    JSON.stringify([...state.expandedFolderIds])
  );
}

function loadEditorLayout() {
  const storedWidth = Number(window.localStorage.getItem("markdown-manager-editor-width"));
  const editorCollapsed = window.localStorage.getItem("markdown-manager-editor-collapsed") === "true";

  if (Number.isFinite(storedWidth)) {
    setEditorWidth(storedWidth);
  } else {
    setEditorWidth(50);
  }

  setEditorCollapsed(editorCollapsed);
}

function loadSidebarLayout() {
  const storedWidth = Number(window.localStorage.getItem("markdown-manager-sidebar-width"));
  setSidebarWidth(Number.isFinite(storedWidth) ? storedWidth : 320);
}

function setSidebarWidth(width) {
  const clamped = Math.max(220, Math.min(520, width));
  document.documentElement.style.setProperty("--sidebar-width", `${clamped}px`);
  window.localStorage.setItem("markdown-manager-sidebar-width", String(clamped));
}

function setEditorWidth(percent) {
  const clamped = Math.max(24, Math.min(76, percent));
  document.documentElement.style.setProperty("--editor-width", `${clamped}%`);
  window.localStorage.setItem("markdown-manager-editor-width", String(clamped));
}

function setEditorCollapsed(collapsed) {
  els.editorGrid.classList.toggle("editor-collapsed", collapsed);
  els.toggleEditorButton.textContent = collapsed ? "展开编辑" : "收起编辑";
  els.toggleEditorButton.title = collapsed ? "展开编辑栏" : "收起编辑栏";
  els.editorResizeHandle.setAttribute("aria-hidden", collapsed ? "true" : "false");
  window.localStorage.setItem("markdown-manager-editor-collapsed", String(collapsed));
}

function isEditorCollapsed() {
  return els.editorGrid.classList.contains("editor-collapsed");
}

function plainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`[\]()!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function renderMarkdown(markdown) {
  if (!markdown.trim()) {
    els.preview.innerHTML = '<p class="muted-preview">暂无内容</p>';
    return;
  }

  if (window.marked && window.DOMPurify) {
    const raw = window.marked.parse(markdown, {
      breaks: true,
      gfm: true
    });
    els.preview.innerHTML = window.DOMPurify.sanitize(raw);
    return;
  }

  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  els.preview.innerHTML = `<pre><code>${escaped}</code></pre>`;
}

function renderTree() {
  const fragment = document.createDocumentFragment();

  for (const folder of getChildFolders(null)) {
    fragment.appendChild(createFolderNode(folder, 0));
  }

  if (state.library.folders.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = "暂无文件夹";
    fragment.appendChild(empty);
  }

  els.folderList.replaceChildren(fragment);
}

function createFolderNode(folder, depth) {
  const folderDocuments = getDocumentsInFolder(folder.id);
  const childFolders = getChildFolders(folder.id);
  const totalCount = state.library.documents.filter((item) => item.folderId === folder.id).length;
  const isExpanded = state.expandedFolderIds.has(folder.id);

  const node = document.createElement("section");
  node.className = "tree-folder";
  node.dataset.folderId = folder.id;
  node.dataset.parentId = folder.parentId || "";
  node.dataset.depth = String(depth);

  const row = document.createElement("div");
  row.className = `tree-folder-row${state.activeFolderId === folder.id ? " active" : ""}`;
  row.draggable = true;
  row.style.setProperty("--tree-depth", String(depth));
  row.addEventListener("dragstart", (event) => startFolderDrag(event, folder));
  row.addEventListener("dragover", (event) => handleFolderDragOver(event, folder, row));
  row.addEventListener("dragleave", () => row.classList.remove("drag-before", "drag-after", "drag-inside"));
  row.addEventListener("drop", (event) => dropFolder(event, folder, row));
  row.addEventListener("dragend", clearFolderDragState);
  row.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    state.activeFolderId = folder.id;
    renderTree();
    showContextMenu(event.clientX, event.clientY, getFolderMenuItems(folder));
  });

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = `tree-toggle${isExpanded ? " expanded" : ""}`;
  toggleButton.disabled = childFolders.length === 0 && folderDocuments.length === 0;
  toggleButton.title = isExpanded ? "收起文件夹" : "展开文件夹";
  toggleButton.textContent = "›";
  toggleButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFolder(folder.id);
  });

  const folderButton = document.createElement("button");
  folderButton.type = "button";
  folderButton.className = "tree-folder-button";
  folderButton.addEventListener("click", () => {
    state.activeFolderId = folder.id;
    if (!state.expandedFolderIds.has(folder.id)) {
      state.expandedFolderIds.add(folder.id);
      saveExpandedFolders();
    }
    renderTree();
  });

  const folderName = document.createElement("span");
  folderName.className = "folder-name";
  folderName.textContent = folder.name;

  const folderCount = document.createElement("span");
  folderCount.className = "folder-count";
  folderCount.textContent = totalCount;

  folderButton.append(folderName, folderCount);
  row.append(toggleButton, folderButton);
  node.appendChild(row);

  const docs = document.createElement("div");
  docs.className = `tree-documents${isExpanded ? "" : " hidden"}`;
  docs.style.setProperty("--tree-depth", String(depth));

  for (const childFolder of childFolders) {
    docs.appendChild(createFolderNode(childFolder, depth + 1));
  }

  if (childFolders.length === 0 && folderDocuments.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tree-empty";
    empty.textContent = state.search.trim() ? "无匹配文档" : "空文件夹";
    docs.appendChild(empty);
  }

  for (const item of folderDocuments) {
    docs.appendChild(createDocumentNode(item, depth + 1));
  }

  node.appendChild(docs);
  return node;
}

function createDocumentNode(item, depth) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `tree-document${item.id === state.activeDocumentId ? " active" : ""}`;
  button.style.setProperty("--tree-depth", String(depth));
  button.addEventListener("click", async () => {
    await selectDocument(item.id);
  });
  button.addEventListener("contextmenu", async (event) => {
    event.preventDefault();
    await flushPendingSave();
    state.activeDocumentId = item.id;
    state.activeFolderId = item.folderId;
    render();
    showContextMenu(event.clientX, event.clientY, getDocumentMenuItems(item));
  });

  const title = document.createElement("span");
  title.className = "tree-document-title";
  title.textContent = item.title || "未命名文档";

  const meta = document.createElement("span");
  meta.className = "tree-document-meta";
  meta.textContent = formatDate(item.updatedAt);

  button.append(title, meta);
  return button;
}

function toggleFolder(folderId) {
  if (state.expandedFolderIds.has(folderId)) {
    state.expandedFolderIds.delete(folderId);
  } else {
    state.expandedFolderIds.add(folderId);
  }
  saveExpandedFolders();
  renderTree();
}

function renderFolderSelect() {
  const options = getSortedFolders().map((folder) => {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = `${"  ".repeat(getFolderDepth(folder.id))}${folder.name}`;
    return option;
  });

  els.folderSelect.replaceChildren(...options);
  const activeDoc = getActiveDocument();
  els.folderSelect.value = activeDoc?.folderId || "inbox";
}

function getFolderDepth(folderId) {
  const foldersById = new Map(state.library.folders.map((folder) => [folder.id, folder]));
  let depth = 0;
  let folder = foldersById.get(folderId);
  const visited = new Set();

  while (folder?.parentId && !visited.has(folder.id)) {
    visited.add(folder.id);
    depth += 1;
    folder = foldersById.get(folder.parentId);
  }

  return depth;
}

function renderEditor() {
  const activeDoc = getActiveDocument();

  if (!activeDoc) {
    els.emptyState.classList.remove("hidden");
    els.editorSurface.classList.add("hidden");
    return;
  }

  els.emptyState.classList.add("hidden");
  els.editorSurface.classList.remove("hidden");
  els.titleInput.value = activeDoc.title;
  els.markdownInput.value = activeDoc.content;
  els.sourcePathLabel.textContent = activeDoc.sourcePath ? activeDoc.sourcePath : "本地资料库";
  renderFolderSelect();
  renderMarkdown(activeDoc.content);
}

function render() {
  els.libraryCount.textContent = `${getVisibleDocumentCount()} 个文档`;
  renderTree();
  renderEditor();
}

async function selectDocument(documentId) {
  if (state.activeDocumentId !== documentId) {
    try {
      await flushPendingSave();
    } catch (error) {
      showToast(error.message || "保存失败");
      return;
    }
  }

  const item = state.library.documents.find((entry) => entry.id === documentId);
  if (item) {
    state.activeFolderId = item.folderId;
    state.expandedFolderIds.add(item.folderId);
    saveExpandedFolders();
  }

  state.activeDocumentId = documentId;
  clearTimeout(state.saveTimer);
  setSaveStatus("已保存");
  render();
}

function setSaveStatus(text) {
  els.saveStatus.textContent = text;
}

function scheduleSave(patch) {
  const activeDoc = getActiveDocument();
  if (!activeDoc) {
    return;
  }

  Object.assign(activeDoc, patch, { updatedAt: new Date().toISOString() });
  setSaveStatus("保存中...");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    try {
      await api.updateDocument(activeDoc.id, patch);
      setSaveStatus("已保存");
    } catch (error) {
      setSaveStatus("保存失败");
      showToast(error.message || "保存失败");
    }
  }, 360);
}

async function flushPendingSave() {
  const activeDoc = getActiveDocument();
  if (!activeDoc || !state.saveTimer) {
    return;
  }

  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  setSaveStatus("保存中...");

  try {
    await api.updateDocument(activeDoc.id, {
      title: activeDoc.title,
      content: activeDoc.content,
      folderId: activeDoc.folderId
    });
    setSaveStatus("已保存");
  } catch (error) {
    setSaveStatus("保存失败");
    throw error;
  }
}

async function createDocument(folderId = state.activeFolderId) {
  try {
    const fallbackFolderId = state.library.folders[0]?.id || "inbox";
    const targetFolderId = state.library.folders.some((folder) => folder.id === folderId)
      ? folderId
      : fallbackFolderId;
    const newDoc = await api.createDocument({
      title: "新文档",
      content: starterMarkdown,
      folderId: targetFolderId
    });
    state.activeFolderId = targetFolderId;
    state.activeDocumentId = newDoc.id;
    state.expandedFolderIds.add(targetFolderId);
    saveExpandedFolders();
    await refreshLibrary();
    showToast("已新建 Markdown 文档");
  } catch (error) {
    showToast(error.message || "新建失败");
  }
}

async function importDocuments() {
  try {
    const imported = await api.importDocuments(state.activeFolderId);
    if (imported.length > 0) {
      state.activeDocumentId = imported[0].id;
      state.activeFolderId = imported[0].folderId;
      state.expandedFolderIds.add(imported[0].folderId);
      saveExpandedFolders();
      await refreshLibrary();
      showToast(`已导入 ${imported.length} 个文件`);
    }
  } catch (error) {
    showToast(error.message || "导入失败");
  }
}

async function importZip() {
  try {
    const result = await api.importZip();
    const imported = result?.imported || [];
    if (imported.length > 0) {
      state.activeDocumentId = imported[0].id;
      state.activeFolderId = imported[0].folderId;
      state.expandedFolderIds.add(imported[0].folderId);
      saveExpandedFolders();
      await refreshLibrary();
      showToast(`已从 ZIP 导入 ${imported.length} 个文档`);
    }
  } catch (error) {
    showToast(error.message || "ZIP 导入失败");
  }
}

async function exportLibraryZip() {
  try {
    await flushPendingSave();
    const result = await api.exportLibraryZip();
    if (result?.filePath) {
      showToast(`已导出 ${result.count} 个文档到 ${result.filePath}`);
    }
  } catch (error) {
    showToast(error.message || "ZIP 导出失败");
  }
}

async function saveSource() {
  const activeDoc = getActiveDocument();
  if (!activeDoc) {
    return;
  }

  try {
    await flushPendingSave();
    const result = await api.saveSource(activeDoc.id);
    await refreshLibrary();
    if (result?.filePath) {
      showToast(`已保存到 ${result.filePath}`);
    }
  } catch (error) {
    showToast(error.message || "保存失败");
  }
}

async function exportDocument() {
  const activeDoc = getActiveDocument();
  if (!activeDoc) {
    return;
  }

  try {
    await flushPendingSave();
    const result = await api.exportDocument(activeDoc.id);
    await refreshLibrary();
    if (result?.filePath) {
      showToast(`已另存为 ${result.filePath}`);
    }
  } catch (error) {
    showToast(error.message || "另存失败");
  }
}

async function renameDocument(item = getActiveDocument()) {
  if (!item) {
    return;
  }

  const nextTitle = await askForText({
    title: "重命名文档",
    value: item.title,
    placeholder: "文档名称"
  });
  if (!nextTitle || nextTitle === item.title) {
    return;
  }

  try {
    await flushPendingSave();
    const updatedDoc = await api.updateDocument(item.id, { title: nextTitle });
    Object.assign(item, updatedDoc);
    if (state.activeDocumentId === item.id) {
      state.activeDocumentId = item.id;
      els.titleInput.value = updatedDoc.title;
    }
    await refreshLibrary();
    showToast("已重命名文档");
  } catch (error) {
    showToast(error.message || "重命名失败");
  }
}

async function deleteDocument(item = getActiveDocument()) {
  if (!item) {
    return;
  }

  const confirmed = window.confirm(`删除“${item.title}”？此操作只会移出软件资料库，不会删除原文件。`);
  if (!confirmed) {
    return;
  }

  try {
    await api.deleteDocument(item.id);
    if (state.activeDocumentId === item.id) {
      state.activeDocumentId = null;
    }
    await refreshLibrary();
    showToast("已删除文档");
  } catch (error) {
    showToast(error.message || "删除失败");
  }
}

async function createFolder() {
  const name = await askForText({
    title: "新建文件夹",
    value: "",
    placeholder: "文件夹名称"
  });
  if (!name) {
    return;
  }

  try {
    const parentId = state.library.folders.some((folder) => folder.id === state.activeFolderId)
      ? state.activeFolderId
      : null;
    const folder = await api.createFolder({ name, parentId });
    state.activeFolderId = folder.id;
    if (folder.parentId) {
      state.expandedFolderIds.add(folder.parentId);
    }
    state.expandedFolderIds.add(folder.id);
    saveExpandedFolders();
    await refreshLibrary();
    showToast("已创建文件夹");
  } catch (error) {
    showToast(error.message || "创建文件夹失败");
  }
}

async function renameFolder(folder) {
  const nextName = await askForText({
    title: "重命名文件夹",
    value: folder.name,
    placeholder: "文件夹名称"
  });
  if (!nextName || nextName === folder.name) {
    return;
  }

  try {
    await api.updateFolder(folder.id, { name: nextName });
    await refreshLibrary();
    showToast("已重命名文件夹");
  } catch (error) {
    showToast(error.message || "重命名失败");
  }
}

async function deleteFolder(folder) {
  if (state.library.folders.length <= 1) {
    showToast("至少需要保留一个文件夹");
    return;
  }

  const fallbackFolder = state.library.folders.find((item) => item.id !== folder.id);
  const confirmed = window.confirm(`删除文件夹“${folder.name}”？其中的文档会移动到“${fallbackFolder.name}”。`);
  if (!confirmed) {
    return;
  }

  try {
    const result = await api.deleteFolder(folder.id);
    state.activeFolderId = result.fallbackFolderId || fallbackFolder.id;
    state.expandedFolderIds.delete(folder.id);
    state.expandedFolderIds.add(state.activeFolderId);
    saveExpandedFolders();
    await refreshLibrary();
    showToast("已删除文件夹");
  } catch (error) {
    showToast(error.message || "删除文件夹失败");
  }
}

async function copyPreviewHtml() {
  try {
    await navigator.clipboard.writeText(els.preview.innerHTML);
    showToast("已复制预览 HTML");
  } catch {
    showToast("复制失败");
  }
}

function getFolderMenuItems(folder) {
  return [
    { label: "新增文档", action: () => createDocument(folder.id) },
    { label: "新增文件夹", action: () => createFolderInFolder(folder.id) },
    { type: "separator" },
    { label: "重命名文件夹", action: () => renameFolder(folder) },
    { label: "删除文件夹", danger: true, action: () => deleteFolder(folder) }
  ];
}

async function createFolderInFolder(parentId) {
  state.activeFolderId = parentId;
  await createFolder();
}

function getDocumentMenuItems(item) {
  return [
    { label: "重命名", action: () => renameDocument(item) },
    { type: "separator" },
    { label: "删除", danger: true, action: () => deleteDocument(item) }
  ];
}

function showContextMenu(x, y, items) {
  const fragment = document.createDocumentFragment();

  for (const item of items) {
    if (item.type === "separator") {
      const separator = document.createElement("div");
      separator.className = "context-separator";
      fragment.appendChild(separator);
      continue;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = `context-item${item.danger ? " danger" : ""}`;
    button.textContent = item.label;
    button.addEventListener("click", () => {
      hideContextMenu();
      item.action();
    });
    fragment.appendChild(button);
  }

  els.contextMenu.replaceChildren(fragment);
  els.contextMenu.classList.remove("hidden");

  const menuWidth = 190;
  const menuHeight = Math.min(items.length * 38 + 16, 240);
  const left = Math.min(x, window.innerWidth - menuWidth - 10);
  const top = Math.min(y, window.innerHeight - menuHeight - 10);
  els.contextMenu.style.left = `${Math.max(10, left)}px`;
  els.contextMenu.style.top = `${Math.max(10, top)}px`;
}

function hideContextMenu() {
  els.contextMenu.classList.add("hidden");
}

function askForText({ title, value = "", placeholder = "" }) {
  return new Promise((resolve) => {
    let done = false;

    const cleanup = () => {
      els.textDialog.removeEventListener("submit", submitHandler);
      els.textDialogCancel.removeEventListener("click", cancelHandler);
      els.textDialogOverlay.removeEventListener("click", overlayHandler);
      document.removeEventListener("keydown", keyHandler);
    };

    const finish = (result) => {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      els.textDialogOverlay.classList.add("hidden");
      resolve(result);
    };

    const submitHandler = (event) => {
      event.preventDefault();
      const nextValue = els.textDialogInput.value.trim();
      if (!nextValue) {
        els.textDialogError.textContent = "名称不能为空";
        els.textDialogInput.focus();
        return;
      }
      finish(nextValue);
    };

    const cancelHandler = () => finish(null);
    const overlayHandler = (event) => {
      if (event.target === els.textDialogOverlay) {
        finish(null);
      }
    };
    const keyHandler = (event) => {
      if (event.key === "Escape") {
        finish(null);
      }
    };

    els.textDialogTitle.textContent = title;
    els.textDialogInput.value = value;
    els.textDialogInput.placeholder = placeholder;
    els.textDialogError.textContent = "";
    els.textDialogOverlay.classList.remove("hidden");
    els.textDialog.addEventListener("submit", submitHandler);
    els.textDialogCancel.addEventListener("click", cancelHandler);
    els.textDialogOverlay.addEventListener("click", overlayHandler);
    document.addEventListener("keydown", keyHandler);

    window.setTimeout(() => {
      els.textDialogInput.focus();
      els.textDialogInput.select();
    }, 0);
  });
}

function toggleSidebar() {
  document.body.classList.toggle("sidebar-collapsed");
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  els.sidebarToggleButton.title = collapsed ? "展开目录栏" : "折叠目录栏";
}

function startSidebarResize(event) {
  if (document.body.classList.contains("sidebar-collapsed")) {
    return;
  }

  event.preventDefault();
  const pointerId = event.pointerId;
  els.sidebarResizeHandle.setPointerCapture(pointerId);
  document.body.classList.add("resizing-sidebar");

  const moveHandler = (moveEvent) => {
    setSidebarWidth(moveEvent.clientX);
  };

  const endHandler = () => {
    document.body.classList.remove("resizing-sidebar");
    els.sidebarResizeHandle.releasePointerCapture(pointerId);
    window.removeEventListener("pointermove", moveHandler);
    window.removeEventListener("pointerup", endHandler);
    window.removeEventListener("pointercancel", endHandler);
  };

  window.addEventListener("pointermove", moveHandler);
  window.addEventListener("pointerup", endHandler);
  window.addEventListener("pointercancel", endHandler);
}

function adjustSidebarWidthFromKeyboard(event) {
  if (document.body.classList.contains("sidebar-collapsed")) {
    return;
  }
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return;
  }

  event.preventDefault();
  const currentWidth = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width")
  );
  const delta = event.key === "ArrowLeft" ? -16 : 16;
  setSidebarWidth((Number.isFinite(currentWidth) ? currentWidth : 320) + delta);
}

function toggleEditorColumn() {
  setEditorCollapsed(!isEditorCollapsed());
}

function startEditorResize(event) {
  if (isEditorCollapsed()) {
    return;
  }

  event.preventDefault();
  const pointerId = event.pointerId;
  els.editorResizeHandle.setPointerCapture(pointerId);
  document.body.classList.add("resizing-editor");

  const moveHandler = (moveEvent) => {
    const bounds = els.editorGrid.getBoundingClientRect();
    const nextPercent = ((moveEvent.clientX - bounds.left) / bounds.width) * 100;
    setEditorWidth(nextPercent);
  };

  const endHandler = () => {
    document.body.classList.remove("resizing-editor");
    els.editorResizeHandle.releasePointerCapture(pointerId);
    window.removeEventListener("pointermove", moveHandler);
    window.removeEventListener("pointerup", endHandler);
    window.removeEventListener("pointercancel", endHandler);
  };

  window.addEventListener("pointermove", moveHandler);
  window.addEventListener("pointerup", endHandler);
  window.addEventListener("pointercancel", endHandler);
}

function adjustEditorWidthFromKeyboard(event) {
  if (isEditorCollapsed()) {
    return;
  }

  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return;
  }

  event.preventDefault();
  const currentWidth = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--editor-width")
  );
  const delta = event.key === "ArrowLeft" ? -4 : 4;
  setEditorWidth((Number.isFinite(currentWidth) ? currentWidth : 50) + delta);
}

function startFolderDrag(event, folder) {
  state.draggedFolderId = folder.id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", folder.id);
}

function getDropPosition(event, row) {
  const bounds = row.getBoundingClientRect();
  const y = event.clientY - bounds.top;
  if (y < bounds.height * 0.28) {
    return "before";
  }
  if (y > bounds.height * 0.72) {
    return "after";
  }
  return "inside";
}

function handleFolderDragOver(event, targetFolder, row) {
  const sourceId = event.dataTransfer.getData("text/plain") || state.draggedFolderId;
  if (!sourceId || sourceId === targetFolder.id || getDescendantFolderIds(sourceId).has(targetFolder.id)) {
    return;
  }

  event.preventDefault();
  row.classList.remove("drag-before", "drag-after", "drag-inside");
  row.classList.add(`drag-${getDropPosition(event, row)}`);
}

async function dropFolder(event, targetFolder, row) {
  event.preventDefault();
  row.classList.remove("drag-before", "drag-after", "drag-inside");
  const sourceId = event.dataTransfer.getData("text/plain") || state.draggedFolderId;
  if (!sourceId || sourceId === targetFolder.id || getDescendantFolderIds(sourceId).has(targetFolder.id)) {
    return;
  }

  const position = getDropPosition(event, row);
  const targetParentId = position === "inside" ? targetFolder.id : targetFolder.parentId || null;
  const siblings = getChildFolders(targetParentId).filter((folder) => folder.id !== sourceId);
  const targetIndex = siblings.findIndex((folder) => folder.id === targetFolder.id);
  const nextIndex = position === "after" ? targetIndex + 1 : position === "before" ? targetIndex : getChildFolders(targetFolder.id).length;

  try {
    await api.moveFolder(sourceId, targetParentId, nextIndex);
    if (position === "inside") {
      state.expandedFolderIds.add(targetFolder.id);
      saveExpandedFolders();
    }
    await refreshLibrary();
    showToast("已调整文件夹顺序");
  } catch (error) {
    showToast(error.message || "移动文件夹失败");
  }
}

function clearFolderDragState() {
  state.draggedFolderId = null;
  for (const row of document.querySelectorAll(".tree-folder-row")) {
    row.classList.remove("drag-before", "drag-after", "drag-inside");
  }
}

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toast.remove();
  }, 2600);
}

async function refreshLibrary() {
  state.library = await api.getLibrary();

  const folderIds = new Set(state.library.folders.map((folder) => folder.id));
  for (const folderId of [...state.expandedFolderIds]) {
    if (!folderIds.has(folderId)) {
      state.expandedFolderIds.delete(folderId);
    }
  }

  if (!folderIds.has(state.activeFolderId)) {
    state.activeFolderId = state.library.folders[0]?.id || "inbox";
  }

  if (state.activeDocumentId && !getActiveDocument()) {
    state.activeDocumentId = null;
  }

  render();
}

function bindEvents() {
  els.newDocumentButton.addEventListener("click", () => createDocument());
  els.emptyNewButton.addEventListener("click", () => createDocument());
  els.importButton.addEventListener("click", importDocuments);
  els.importZipButton.addEventListener("click", importZip);
  els.exportZipButton.addEventListener("click", exportLibraryZip);
  els.addFolderButton.addEventListener("click", createFolder);
  els.sidebarToggleButton.addEventListener("click", toggleSidebar);
  els.sidebarResizeHandle.addEventListener("pointerdown", startSidebarResize);
  els.sidebarResizeHandle.addEventListener("keydown", adjustSidebarWidthFromKeyboard);
  els.saveSourceButton.addEventListener("click", saveSource);
  els.exportButton.addEventListener("click", exportDocument);
  els.deleteButton.addEventListener("click", () => deleteDocument());
  els.toggleEditorButton.addEventListener("click", toggleEditorColumn);
  els.editorResizeHandle.addEventListener("pointerdown", startEditorResize);
  els.editorResizeHandle.addEventListener("keydown", adjustEditorWidthFromKeyboard);
  els.copyHtmlButton.addEventListener("click", copyPreviewHtml);

  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderTree();
    els.libraryCount.textContent = `${getVisibleDocumentCount()} 个文档`;
  });

  els.titleInput.addEventListener("input", (event) => {
    scheduleSave({ title: event.target.value });
    renderTree();
  });

  els.markdownInput.addEventListener("input", (event) => {
    renderMarkdown(event.target.value);
    scheduleSave({ content: event.target.value });
  });

  els.folderSelect.addEventListener("change", (event) => {
    state.activeFolderId = event.target.value;
    state.expandedFolderIds.add(event.target.value);
    saveExpandedFolders();
    scheduleSave({ folderId: event.target.value });
    renderTree();
  });

  document.addEventListener("click", hideContextMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideContextMenu();
    }
  });
  window.addEventListener("resize", hideContextMenu);

  api.onLibraryChanged((library) => {
    state.library = library;
    render();
  });

  api.onMenuAction("menu:new-document", () => createDocument());
  api.onMenuAction("menu:import-document", importDocuments);
  api.onMenuAction("menu:import-zip", importZip);
  api.onMenuAction("menu:export-library-zip", exportLibraryZip);
  api.onMenuAction("menu:save-source", saveSource);
  api.onMenuAction("menu:export-document", exportDocument);
}

async function init() {
  bindEvents();
  await refreshLibrary();

  if (state.library.documents.length > 0) {
    const firstDoc = state.library.documents[0];
    state.activeDocumentId = firstDoc.id;
    state.activeFolderId = firstDoc.folderId;
    state.expandedFolderIds.add(firstDoc.folderId);
    saveExpandedFolders();
    render();
  }
}

init().catch((error) => {
  showToast(error.message || "应用初始化失败");
});
