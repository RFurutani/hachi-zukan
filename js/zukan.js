// 図鑑リスト（F-03）。サーバーの値はすべて textContent で出す（S-04）。
import { fetchExport, fetchZukan, fetchPhoto, postAttachment } from "./api.js";
import { describeAttachedOn } from "./dates.js";

const listEl = document.getElementById("zukanList");
const messageEl = document.getElementById("zukanMessage");
const bagNowEl = document.getElementById("bagNow");
const summaryEl = document.getElementById("summaryLine");
const sortEl = document.getElementById("sortOrder");

const HIDDEN_LABEL = "？？？";
let currentData = null;
let openPrefs = new Set();
let onUnauthorized = () => {};
let onEdit = () => {};
let onRegister = () => {};

const recordDialog = document.getElementById("recordDialog");
const recordList = document.getElementById("recordList");
document.getElementById("recordCancel").addEventListener("click", () => recordDialog.close());

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

async function loadThumb(img, photoId) {
  try {
    const res = await fetchPhoto(photoId);
    if (res.ok) {
      const url = URL.createObjectURL(await res.blob());
      img.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
      img.src = url;
    }
  } catch {
    // サムネイルが出ないだけなので、枠はそのまま残す。
  }
}

// 同じ商品を複数持っているときは、どの記録を直すか選んでもらう。
function chooseRecord(records) {
  if (records.length === 1) {
    onEdit(records[0].itemId);
    return;
  }
  recordList.textContent = "";
  for (const record of records) {
    const parts = [record.purchasedOn, "★".repeat(record.rating)];
    if (record.placeName) {
      parts.push(record.placeName);
    }
    const button = el("button", "button", parts.join("  "));
    button.type = "button";
    button.addEventListener("click", () => {
      recordDialog.close();
      onEdit(record.itemId);
    });
    recordList.append(button);
  }
  recordDialog.showModal();
}

function editButton(records) {
  const button = el("button", "slot-edit", "直す");
  button.type = "button";
  button.addEventListener("click", () => chooseRecord(records));
  return button;
}

// カバン付け替えメモ（J-27）。同じ商品を複数持っていたら、いちばん新しい記録に付ける。
function attachButton(entry) {
  const button = el("button", "slot-attach", "🎒 今日付けた");
  button.type = "button";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const res = await postAttachment(entry.items[0].itemId);
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        messageEl.textContent = data.error || `記録できませんでした（HTTP ${res.status}）。もう一度押してください。`;
        return;
      }
      await refreshZukan(`「${entry.name}」を今日カバンに付けた、と記録しました。`);
    } catch {
      messageEl.textContent = "サーバーに接続できません。通信を確認してもう一度押してください。";
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function photoSlot(entry, name, metaLines, className, records, extraButtons = []) {
  const slot = el("div", `slot ${className}`);
  const img = el("img", "slot-photo");
  img.alt = name;
  if (entry.photoId) {
    img.dataset.photoId = entry.photoId;
  }
  slot.append(img);
  const text = el("div", "slot-text");
  text.append(el("span", "slot-name", name));
  for (const line of metaLines) {
    text.append(el("span", line.className || "slot-meta", line.text ?? line));
  }
  slot.append(text, ...extraButtons, editButton(records));
  return slot;
}

function ownedSlot(entry) {
  const meta = [`${"★".repeat(entry.rating)}${entry.count > 1 ? ` ×${entry.count}` : ""}`, entry.purchasedOn];
  if (entry.placeName) {
    meta.push(entry.placeName);
  }
  if (entry.memo) {
    meta.push(entry.memo);
  }
  if (entry.lastAttachedOn) {
    meta.push({ className: "slot-meta slot-attached", text: `最後に付けた日：${describeAttachedOn(entry.lastAttachedOn)}` });
  }
  return photoSlot(entry, entry.name, meta, "slot-owned", entry.items, [attachButton(entry)]);
}

function renderBagNow(current) {
  if (!current) {
    bagNowEl.hidden = true;
    bagNowEl.textContent = "";
    return;
  }
  bagNowEl.textContent = "";
  bagNowEl.append(
    el("span", "bag-now-label", "🎒 今カバンに付けている："),
    el("span", "bag-now-name", current.name),
    el("span", "bag-now-date", `　${describeAttachedOn(current.attachedOn)}から`)
  );
  bagNowEl.hidden = false;
}

function unmatchedSlot(entry) {
  const meta = ["★".repeat(entry.rating), entry.purchasedOn];
  if (entry.placeName) {
    meta.push(entry.placeName);
  }
  return photoSlot(entry, entry.inputName, meta, "slot-unmatched", [entry]);
}

// 未所有の枠。押すとその県（広域）を選んだ登録画面へ進む（J-25）。
// 枠が持つのは県の情報だけ。どの商品の枠かはサーバーから受け取っていないので、DOMにも変数にも無い。
function hiddenSlot(pref) {
  const button = el("button", "slot slot-hidden", HIDDEN_LABEL);
  button.type = "button";
  button.setAttribute("aria-label", `${pref.name}の未登録の枠。この${pref.isWide ? "広域" : "県"}で登録する`);
  button.addEventListener("click", () => onRegister({ isWide: Boolean(pref.isWide), code: pref.code }));
  return button;
}

function appendGroup(body, label, entries, toSlot) {
  if (entries.length === 0) {
    return;
  }
  body.append(el("p", "group-label", label));
  const slots = el("div", "slots");
  entries.forEach((entry) => slots.append(toSlot(entry)));
  body.append(slots);
}

function renderPrefBody(pref, body) {
  const mains = pref.owned.filter((entry) => entry.kind === "main");
  if (mains.length > 0 || pref.hiddenCount > 0) {
    const slots = el("div", "slots");
    mains.forEach((entry) => slots.append(ownedSlot(entry)));
    for (let i = 0; i < pref.hiddenCount; i += 1) {
      slots.append(hiddenSlot(pref));
    }
    body.append(slots);
  }
  if (pref.surveying) {
    body.prepend(el("p", "pref-none", "調査中のため、コンプリートの対象外です。登録はできます。"));
  }
  appendGroup(body, "レジェンド（廃番）", pref.owned.filter((e) => e.kind === "legend"), ownedSlot);
  appendGroup(body, "未照合（新商品かも）", pref.unmatched, unmatchedSlot);
  body.querySelectorAll("img[data-photo-id]").forEach((img) => loadThumb(img, img.dataset.photoId));
}

function renderPref(pref) {
  const details = el("details", `pref${pref.complete ? " pref-complete" : ""}${pref.total === 0 ? " pref-empty" : ""}`);
  const summary = document.createElement("summary");
  summary.append(el("span", "pref-name", pref.complete ? `👑 ${pref.name}` : pref.name));
  summary.append(el("span", "pref-count", pref.surveying ? "調査中" : `${pref.ownedCount}/${pref.total}`));
  const pips = el("span", "pips");
  pips.setAttribute("aria-hidden", "true");
  for (let i = 0; i < pref.total; i += 1) {
    pips.append(el("span", `pip${i < pref.ownedCount ? " pip-filled" : ""}`));
  }
  summary.append(pips);
  details.append(summary);

  const body = el("div", "pref-body");
  details.append(body);

  let rendered = false;
  const renderOnce = () => {
    if (!rendered) {
      rendered = true;
      renderPrefBody(pref, body); // 開いたときだけ写真を読みに行く
    }
  };
  details.addEventListener("toggle", () => {
    if (details.open) {
      openPrefs.add(pref.code);
      renderOnce();
      // 固定ヘッダーの下に県の行が隠れないよう、開いた行を見える位置へ動かす。
      details.scrollIntoView({ block: "nearest" });
    } else {
      openPrefs.delete(pref.code);
    }
  });
  if (openPrefs.has(pref.code)) {
    details.open = true;
  }
  return details;
}

function progressRate(pref) {
  return pref.total === 0 ? -1 : pref.ownedCount / pref.total;
}

function render() {
  if (!currentData) {
    return;
  }
  listEl.textContent = "";
  if (sortEl.value === "progress") {
    currentData.regions
      .flatMap((region) => region.prefs)
      .sort((a, b) => progressRate(b) - progressRate(a) || a.code.localeCompare(b.code))
      .forEach((pref) => listEl.append(renderPref(pref)));
  } else {
    for (const region of currentData.regions) {
      listEl.append(el("h2", "region-name", region.name));
      region.prefs.forEach((pref) => listEl.append(renderPref(pref)));
    }
  }
  // 広域は県・全国とは別枠。
  if (currentData.wideAreas.length > 0) {
    listEl.append(el("h2", "region-name", "広域（県とは別枠）"));
    currentData.wideAreas.forEach((wide) => listEl.append(renderPref(wide)));
  }
}

export function setZukanEditHandler(handler) {
  onEdit = handler;
}

export function setZukanRegisterHandler(handler) {
  onRegister = handler;
}

export function setZukanUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export async function refreshZukan(notice = "") {
  messageEl.textContent = currentData ? "" : "読み込んでいます…";
  try {
    const res = await fetchZukan();
    if (res.status === 401) {
      onUnauthorized();
      return;
    }
    if (!res.ok) {
      messageEl.textContent = `図鑑を読み込めませんでした（HTTP ${res.status}）。再読み込みしてください。`;
      return;
    }
    currentData = await res.json();
    const { summary, rematched } = currentData;
    const national = summary.nationalComplete ? "👑 全国コンプリート！ " : "";
    summaryEl.textContent = `${national}コンプリート ${summary.completePrefs}/${summary.targetPrefCount} 都道府県（調査中 ${summary.surveyingPrefCount}）、所有 ${summary.ownedMain}/${summary.totalMain} 個、広域 ${summary.completeWides}/${summary.targetWideCount}`;
    messageEl.textContent = notice || (rematched > 0 ? `未照合のうち${rematched}件がマスタと一致しました。` : "");
    renderBagNow(currentData.currentAttachment);
    render();
  } catch {
    messageEl.textContent = "サーバーに接続できません。通信を確認して再読み込みしてください。";
  }
}

export function clearZukan() {
  currentData = null;
  openPrefs = new Set();
  listEl.textContent = "";
  summaryEl.textContent = "";
  renderBagNow(null);
}

sortEl.addEventListener("change", render);

// 所有記録をCSVで書き出す（F-10 の最小版）。写真の本体は含まれない。
document.getElementById("exportButton").addEventListener("click", async () => {
  try {
    const res = await fetchExport();
    if (res.status === 401) {
      onUnauthorized();
      return;
    }
    if (!res.ok) {
      messageEl.textContent = `書き出せませんでした（HTTP ${res.status}）。もう一度試してください。`;
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const link = document.createElement("a");
    link.href = url;
    link.download = `hachi-zukan-records-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    messageEl.textContent = "CSVを書き出しました。写真の本体は含まれません。";
  } catch {
    messageEl.textContent = "サーバーに接続できません。通信を確認してもう一度押してください。";
  }
});
