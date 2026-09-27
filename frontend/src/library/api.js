// Agora Library API — all calls are same-origin (no proxy needed)

async function request(endpoint, options = {}) {
  const url = `${endpoint}`;

  // Build config — handle FormData separately so we don't clobber headers
  const isFormData = options.body instanceof FormData;
  const config = {
    method: options.method || "GET",
    headers: { ...(options.headers || {}) },
  };

  if (options.body) {
    if (isFormData) {
      // Let the browser set multipart Content-Type automatically
      config.body = options.body;
    } else {
      config.headers["Content-Type"] = "application/json";
      config.body = JSON.stringify(options.body);
    }
  }

  // Pass through any other fetch options
  for (const key of Object.keys(options)) {
    if (!["method", "headers", "body"].includes(key)) {
      config[key] = options[key];
    }
  }

  try {
    const res = await fetch(url, config);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let errMsg = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(text);
        errMsg = parsed.detail || parsed.error || errMsg;
      } catch {
        if (text) errMsg = text;
      }
      throw new Error(errMsg);
    }

    // Handle file downloads (blob responses)
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/octet-stream") || contentType.includes("application/zip")) {
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const filename = filenameMatch ? filenameMatch[1].replace(/['"]/g, "") : "download";
      return { blob, filename };
    }

    const text = await res.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch (err) {
    if (err.message && err.message.startsWith("HTTP")) throw err;
    throw new Error(`Network error: ${err.message}`);
  }
}

// ── Notes ──

export async function getNotes({ search = "", tag = "", parent_id = "", pinned = "" } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (tag) params.set("tag", tag);
  if (parent_id) params.set("parent_id", parent_id);
  if (pinned !== "") params.set("pinned", pinned);
  const qs = params.toString();
  return request(`/api/notes${qs ? "?" + qs : ""}`);
}

export async function getNote(id) {
  return request(`/api/notes/${id}`);
}

export async function createNote({ title, body, parent_id, folder_id, tags = [] }) {
  return request("/api/notes", {
    method: "POST",
    body: { title, body, parent_id, folder_id, tags },
  });
}

export async function updateNote(id, { title, body, parent_id, folder_id, tags = [] }) {
  return request(`/api/notes/${id}`, {
    method: "PUT",
    body: { title, body, parent_id, folder_id, tags },
  });
}

export async function deleteNote(id) {
  return request(`/api/notes/${id}`, { method: "DELETE" });
}

export async function pinNote(id, pinned = true) {
  return request(`/api/notes/${id}/pin?pinned=${pinned}`, { method: "PATCH" });
}

export async function toggleTask(id, taskIndex) {
  return request(`/api/notes/${id}/toggle-task?task_index=${taskIndex}`, {
    method: "PATCH",
  });
}

// ── Tree ──

export async function getTree() {
  return request("/api/tree");
}

// ── Tags ──

export async function getTags() {
  return request("/api/notes/tags/all");
}

export async function getNoteTags(noteId) {
  return request(`/api/notes/${noteId}/tags`);
}

export async function addTag(noteId, name) {
  return request(`/api/notes/${noteId}/tags`, {
    method: "POST",
    body: { tag: name },
  });
}

export async function removeTag(noteId, tagName) {
  return request(`/api/notes/${noteId}/tags/${encodeURIComponent(tagName)}`, {
    method: "DELETE",
  });
}

// ── Search ──

export async function searchNotes(q) {
  return request(`/api/notes/search?q=${encodeURIComponent(q)}`);
}

// ── Backlinks ──

export async function getBacklinks(id) {
  return request(`/api/notes/${id}/backlinks`);
}

// ── Attachments ──

export async function listAttachments(noteId) {
  return request(`/api/notes/${noteId}/attachments`);
}

export async function uploadAttachment(noteId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return request(`/api/notes/${noteId}/attachments`, {
    method: "POST",
    body: formData,
  });
}

export async function downloadAttachment(id) {
  const res = await fetch(`/api/notes/attachments/${id}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let errMsg = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      errMsg = parsed.detail || parsed.error || errMsg;
    } catch {
      if (text) errMsg = text;
    }
    throw new Error(errMsg);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^\n]*)/);
  const filename = match ? match[1].replace(/['"]/g, "") : "download";
  return { blob, filename };
}

export async function deleteAttachment(id) {
  return request(`/api/notes/attachments/${id}`, { method: "DELETE" });
}

// ── Import/Export ──

export async function exportNotes() {
  return request("/api/export");
}

export async function importNotes(notes) {
  return request("/api/import", {
    method: "POST",
    body: { notes },
  });
}

// ── Web Clipper ──

export async function clipUrl(url) {
  return request("/api/clip", {
    method: "POST",
    body: { url },
  });
}

// ── Stats ──

export async function getActivity() {
  return request("/api/stats/activity");
}

// ── Code Execution ──

export async function runCode(language, code) {
  return request("/api/run-code", {
    method: "POST",
    body: { language, code },
  });
}
