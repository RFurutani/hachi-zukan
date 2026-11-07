// IDトークンはタブを閉じると消える sessionStorage に置く（ASHIATOと同じ）。
// 同じ github.io オリジンの別アプリと混ざらないよう、キーにこのアプリの接頭辞を付ける。
const STORAGE_KEY = "gz.idToken";

export function saveIdToken(idToken) {
  sessionStorage.setItem(STORAGE_KEY, idToken);
}

export function loadIdToken() {
  return sessionStorage.getItem(STORAGE_KEY);
}

export function clearIdToken() {
  sessionStorage.removeItem(STORAGE_KEY);
}

// 署名は見ない（本当の検証はWorker）。期限切れで無駄に問い合わせないためだけに使う。
function decodePayload(idToken) {
  const payload = idToken.split(".")[1];
  return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
}

export function isExpired(idToken) {
  try {
    return Date.now() >= decodePayload(idToken).exp * 1000;
  } catch {
    return true;
  }
}

export function getRemainingSeconds(idToken) {
  try {
    return Math.max(0, Math.floor(decodePayload(idToken).exp - Date.now() / 1000));
  } catch {
    return null;
  }
}
