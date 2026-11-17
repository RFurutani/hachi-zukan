// 図鑑リスト（F-03）。サーバーの値はすべて textContent で出す（S-04）。
import { deleteAttachment, fetchExport, fetchZukan, fetchPhoto, postAttachment } from "./api.js";
import { describeAttachTotals, describeAttachedOn, describePeriod, describePeriodDays } from "./dates.js";
import { showToast } from "./toast.js";

const listEl = document.getElementById("zukanList");
const messageEl = document.getElementById("zukanMessage");
const bagNowEl = document.getElementById("bagNow");
const summaryEl = document.getElementById("summaryLine");
const sortEl = document.getElementById("sortOrder");
const sortControlsEl = document.getElementById("sortControls");
const viewByPrefButton = document.getElementById("viewByPref");
const viewByOrderButton = document.getElementById("viewByOrder");

const HIDDEN_LABEL = "？？？";
// 図鑑の並べ方（J-30）。この端末のこのブラウザにだけ覚える。読めない・書けない環境でも「県別」で動く。
const VIEW_STORAGE_KEY = "gz.zukanView";
const VIEW_PREF = "pref";
const VIEW_ORDER = "order";
let currentData = null;
let openPrefs = new Set();
let viewMode = loadViewMode();
// 読み込みが重なったとき（「今日付けた」の直後に「取り消す」など）、最後に頼んだ結果だけを画面に出す。
let refreshSeq = 0;
let onUnauthorized = () => {};
let onEdit = () => {};
let onRegister = () => {};
let onAttachChanged = () => {};

function loadViewMode() {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === VIEW_ORDER ? VIEW_ORDER : VIEW_PREF;
  } catch {
    return VIEW_PREF;
  }
}

function saveViewMode(mode) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, mode);
  } catch {
    // 覚えられないだけで、表示は切り替わる。
  }
}

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

// 「今日付けた」の取り消し（J-31）。記録のIDで消すので、ほかの日の記録には触れない。
// その間に「直す」画面などで消されていたら、Worker は 404 を返す（もう消えているので、そのまま伝える）。
async function undoAttachment(attachmentId, name) {
  try {
    const res = await deleteAttachment(attachmentId);
    if (res.status === 401) {
      onUnauthorized();
      return;
    }
    if (!res.ok && res.status !== 404) {
      showToast(`取り消せませんでした（HTTP ${res.status}）。「直す」画面の「カバンに付けた日」から消せます。`);
      return;
    }
    await refreshZukan();
    onAttachChanged();
    showToast(res.ok ? `🎒${name}の記録を取り消しました` : "その記録はもう消えていました");
  } catch {
    showToast("サーバーに接続できません。「直す」画面の「カバンに付けた日」から消せます。");
  }
}

// カバン付け替えメモ（J-27）。同じ商品を複数持っていたら、いちばん新しい記録に付ける。
function attachButton(itemId, name) {
  const button = el("button", "slot-attach", "🎒 今日付けた");
  button.type = "button";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const res = await postAttachment(itemId);
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        messageEl.textContent = data.error || `記録できませんでした（HTTP ${res.status}）。もう一度押してください。`;
        return;
      }
      // 同じ日の2回目は記録が増えない（J-27）。先の記録を消さないよう、取り消しは出さない。
      if (data.created === false) {
        showToast(`🎒${name}は今日すでに記録済みです`);
      } else {
        showToast(`🎒${name}を今日付けたで記録しました`, { onUndo: () => undoAttachment(data.id, name) });
      }
      await refreshZukan();
      onAttachChanged();
    } catch {
      messageEl.textContent = "サーバーに接続できません。通信を確認してもう一度押してください。";
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function photoSlot(entry, name, metaLines, className, records, extraButtons = [], extraText = []) {
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
  text.append(...extraText);
  slot.append(text, ...extraButtons, editButton(records));
  return slot;
}

// カードの「付けた期間」（J-28）。開いたときだけ一覧が見える。
function periodDetails(periods) {
  const details = el("details", "slot-periods");
  details.append(el("summary", "slot-periods-toggle", "付けた期間"));
  const list = el("ul", "slot-periods-list");
  for (const period of periods) {
    list.append(el("li", "slot-period", `${describePeriod(period)}・${describePeriodDays(period)}`));
  }
  details.append(list);
  return details;
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
  const periods = entry.attachPeriods || [];
  if (entry.attachCount > 0) {
    meta.push({ className: "slot-meta slot-attach-totals", text: describeAttachTotals(entry.attachCount, entry.attachDays) });
  }
  const extraText = periods.length > 0 ? [periodDetails(periods)] : [];
  return photoSlot(entry, entry.name, meta, "slot-owned", entry.items, [attachButton(entry.items[0].itemId, entry.name)], extraText);
}

// 「登録順」のカード（J-30）。1個ずつ。左上に No.（いちばん古い登録が No.1）。
const TIMELINE_KIND_LABEL = { legend: "レジェンド（廃番）", unmatched: "未照合（新商品かも）" };

function timelineSlot(record) {
  const meta = [`${record.scopeName}・${"★".repeat(record.rating)}`, record.purchasedOn];
  if (record.placeName) {
    meta.push(record.placeName);
  }
  if (TIMELINE_KIND_LABEL[record.kind]) {
    meta.push({ className: "slot-meta slot-kind", text: TIMELINE_KIND_LABEL[record.kind] });
  }
  if (record.lastAttachedOn) {
    meta.push({ className: "slot-meta slot-attached", text: `最後に付けた日：${describeAttachedOn(record.lastAttachedOn)}` });
  }
  const matched = record.kind !== "unmatched";
  const slot = photoSlot(
    record,
    record.name,
    meta,
    `slot-timeline ${matched ? "slot-owned" : "slot-unmatched"}`,
    [record],
    matched ? [attachButton(record.itemId, record.name)] : []
  );
  slot.querySelector(".slot-text").prepend(el("span", "slot-no", `No.${record.no}`));
  return slot;
}

// 写真は見える位置に来てから読む（記録が多くても一度に読みに行かない）。
function loadThumbsWhenVisible(root) {
  const imgs = [...root.querySelectorAll("img[data-photo-id]")];
  if (typeof IntersectionObserver !== "function") {
    imgs.forEach((img) => loadThumb(img, img.dataset.photoId));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        observer.unobserve(entry.target);
        loadThumb(entry.target, entry.target.dataset.photoId);
      }
    }
  }, { rootMargin: "200px" });
  imgs.forEach((img) => observer.observe(img));
}

// 所有している記録（未照合も含む）だけを並べる。未所有の枠（？？？）は出さない（C-01）。
function renderTimeline(timeline) {
  if (timeline.length === 0) {
    listEl.append(el("p", "pref-none timeline-empty", "まだ記録がありません。「登録」タブから登録できます。"));
    return;
  }
  listEl.append(el("p", "timeline-note", `登録の新しい順（全${timeline.length}件）。No.1 がいちばん古い登録です。`));
  const slots = el("div", "slots timeline");
  timeline.forEach((record) => slots.append(timelineSlot(record)));
  listEl.append(slots);
  loadThumbsWhenVisible(slots);
}

// 図鑑の上部（J-28）：「🎒 今カバンに付けている：名前（N日目）」。日数は Worker が日本時間で数えた値。
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
    el("span", "bag-now-date", `（${current.days}日目）`)
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

function renderViewSwitch() {
  viewByPrefButton.setAttribute("aria-pressed", String(viewMode === VIEW_PREF));
  viewByOrderButton.setAttribute("aria-pressed", String(viewMode === VIEW_ORDER));
  // 「北から／進捗順」は県別のときだけ意味がある。
  sortControlsEl.hidden = viewMode !== VIEW_PREF;
}

function render() {
  renderViewSwitch();
  if (!currentData) {
    return;
  }
  listEl.textContent = "";
  if (viewMode === VIEW_ORDER) {
    renderTimeline(currentData.timeline || []);
    return;
  }
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

// 付けた日の記録が増えた・消えたとき（カバンのタブを開いていたら、そちらも読み直すため）。
export function setZukanAttachChangedHandler(handler) {
  onAttachChanged = handler;
}

export async function refreshZukan(notice = "") {
  const seq = ++refreshSeq;
  messageEl.textContent = currentData ? "" : "読み込んでいます…";
  try {
    const res = await fetchZukan();
    if (seq !== refreshSeq) {
      return;
    }
    if (res.status === 401) {
      onUnauthorized();
      return;
    }
    if (!res.ok) {
      messageEl.textContent = `図鑑を読み込めませんでした（HTTP ${res.status}）。再読み込みしてください。`;
      return;
    }
    const data = await res.json();
    if (seq !== refreshSeq) {
      return;
    }
    currentData = data;
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
  refreshSeq += 1; // ログアウト前に頼んだ読み込みの結果は出さない
  currentData = null;
  openPrefs = new Set();
  listEl.textContent = "";
  summaryEl.textContent = "";
  renderBagNow(null);
}

sortEl.addEventListener("change", render);

function setViewMode(mode) {
  if (mode === viewMode) {
    return;
  }
  viewMode = mode;
  saveViewMode(mode);
  render();
  window.scrollTo({ top: 0 });
}
viewByPrefButton.addEventListener("click", () => setViewMode(VIEW_PREF));
viewByOrderButton.addEventListener("click", () => setViewMode(VIEW_ORDER));
renderViewSwitch();

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
