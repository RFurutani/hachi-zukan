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

export function fetchPhoto(photoId) {
  return fetch(`${API_BASE}/api/photos/${encodeURIComponent(photoId)}`, { headers: authHeaders() });
}
