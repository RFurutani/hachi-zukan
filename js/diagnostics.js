// 診断画面（F-09。ASHIATOの診断画面を流用）。ログイン前でも開ける。
// トークンやメールアドレスはスクリーンショットで渡る可能性があるので表示しない。
import { fetchHealth, fetchMe } from "./api.js";
import { APP_VERSION } from "./config.js";
import { loadIdToken, isExpired, getRemainingSeconds } from "./token-store.js";

const dialog = document.getElementById("diagnosticsDialog");
const list = document.getElementById("diagnosticsList");

function addRow(label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  list.append(dt, dd);
}

async function runDiagnostics() {
  list.textContent = "";
  addRow("実行時刻", new Date().toLocaleString("ja-JP"));
  addRow("版数", `v${APP_VERSION}`);
  addRow("User Agent", navigator.userAgent);
  addRow("画面サイズ", `${window.innerWidth} × ${window.innerHeight}`);

  const idToken = loadIdToken();
  const loggedIn = Boolean(idToken) && !isExpired(idToken);
  if (!idToken) {
    addRow("ログイン状態", "未ログイン");
  } else if (!loggedIn) {
    addRow("ログイン状態", "期限切れ");
  } else {
    const remaining = getRemainingSeconds(idToken);
    addRow("ログイン状態", `ログイン済み（残り約${Math.floor((remaining ?? 0) / 60)}分）`);
  }

  const start = performance.now();
  try {
    const res = await fetchHealth();
    const elapsed = Math.round(performance.now() - start);
    if (res.ok) {
      const data = await res.json();
      addRow("API疎通", `OK（${elapsed}ms、DB: ${data.db}、KV: ${data.kv}）`);
      // 画面と Worker の版がそろっているか（反映漏れの確認）。
      const apiVersion = data.version ? `v${data.version}` : "不明（古い Worker）";
      addRow("APIの版数", data.version === APP_VERSION ? apiVersion : `${apiVersion}（画面は v${APP_VERSION}。反映が済んでいません）`);
    } else {
      addRow("API疎通", `異常（HTTP ${res.status}、${elapsed}ms）`);
    }
  } catch {
    addRow("API疎通", "接続できませんでした");
  }

  if (!loggedIn) {
    addRow("認証結果", "未確認（未ログインのため）");
    return;
  }
  try {
    const res = await fetchMe();
    const labels = { 200: "200（正常）", 401: "401（ログインのやり直しが必要）", 403: "403（対象外のアカウント）" };
    addRow("認証結果", labels[res.status] || `HTTP ${res.status}`);
  } catch {
    addRow("認証結果", "接続できませんでした");
  }
}

document.getElementById("diagnosticsButton").addEventListener("click", () => {
  dialog.showModal();
  runDiagnostics();
});
document.getElementById("diagnosticsClose").addEventListener("click", () => dialog.close());
