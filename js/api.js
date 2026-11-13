import { API_BASE } from "./config.js";
import { loadIdToken } from "./token-store.js";

function authHeaders() {
  return { Authorization: `Bearer ${loadIdToken()}` };
}

export function fetchHealth() {
  return fetch(`${API_BASE}/api/health`);
}

export function fetchMe() {
  return fetch(`${API_BASE}/api/me`, { headers: authHeaders() });
}

export function fetchPrefectures() {
  return fetch(`${API_BASE}/api/prefectures`, { headers: authHeaders() });
}

export function fetchZukan() {
  return fetch(`${API_BASE}/api/zukan`, { headers: authHeaders() });
}

export function postItem(formData) {
  return fetch(`${API_BASE}/api/items`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
}

export function fetchExport() {
  return fetch(`${API_BASE}/api/export`, { headers: authHeaders() });
}

export function fetchItem(itemId) {
  return fetch(`${API_BASE}/api/items/${encodeURIComponent(itemId)}`, { headers: authHeaders() });
}

export function patchItem(itemId, formData) {
  return fetch(`${API_BASE}/api/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: formData,
  });
}

export function deleteItem(itemId) {
  return fetch(`${API_BASE}/api/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

// 付けた日の記録（J-27）。日付を付けずに呼ぶと、Worker が日本時間の当日で保存する。
export function postAttachment(itemId) {
  return fetch(`${API_BASE}/api/items/${encodeURIComponent(itemId)}/attachments`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export function fetchAttachments(itemId) {
  return fetch(`${API_BASE}/api/items/${encodeURIComponent(itemId)}/attachments`, { headers: authHeaders() });
}

export function deleteAttachment(attachmentId) {
  return fetch(`${API_BASE}/api/attachments/${encodeURIComponent(attachmentId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export function fetchPhoto(photoId) {
  return fetch(`${API_BASE}/api/photos/${encodeURIComponent(photoId)}`, { headers: authHeaders() });
}
