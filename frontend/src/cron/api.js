// Cron API — same-origin calls to /api/cron

async function request(endpoint, options = {}) {
  const config = {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
  };
  if (options.body) config.body = JSON.stringify(options.body);
  const res = await fetch(endpoint, config);
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
  return res.json();
}

export async function getCronJobs() {
  return request("/api/cron/list");
}

export async function getScripts() {
  return request("/api/cron/scripts");
}

export async function readScript(filename) {
  return request(`/api/cron/scripts/${encodeURIComponent(filename)}`);
}

export async function saveScript(filename, content) {
  return request(`/api/cron/scripts/${encodeURIComponent(filename)}`, {
    method: "PUT",
    body: { content },
  });
}
