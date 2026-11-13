// 登録画面（F-01）、記録の修正・削除（D-19）、照合結果の演出（F-02）。
// 表示は textContent のみ（S-04）。
// 前回の入力は引き継がない（J-23）。登録の保存後・登録タブを開いたとき・修正をやめたときは全項目を初期状態に戻す。
import {
  deleteAttachment,
  deleteItem,
  fetchAttachments,
  fetchItem,
  fetchPhoto,
  fetchPrefectures,
  patchItem,
  postItem,
} from "./api.js";
import { describeAttachedOn } from "./dates.js";
import { compressImage } from "./photo.js";

const MAX_PHOTOS = 5;
const WIDE_PREFIX = "wide:";
const CODE_PATTERN = /^(\d{13}|(CKW)?\d{5})$/i;

const form = document.getElementById("registerForm");
const editBanner = document.getElementById("editBanner");
const editCancelButton = document.getElementById("editCancelButton");
const existingPhotos = document.getElementById("existingPhotos");
const photoInput = document.getElementById("photoInput");
const photoPreview = document.getElementById("photoPreview");
const photoCount = document.getElementById("photoCount");
const clearPhotosButton = document.getElementById("clearPhotosButton");
const nameInput = document.getElementById("nameInput");
const prefSelect = document.getElementById("prefSelect");
const codeInput = document.getElementById("codeInput");
const purchasePrefSelect = document.getElementById("purchasePrefSelect");
const dateInput = document.getElementById("dateInput");
const placeInput = document.getElementById("placeInput");
const memoInput = document.getElementById("memoInput");
const ratingGroup = document.getElementById("ratingGroup");
const message = document.getElementById("registerMessage");
const submitButton = document.getElementById("registerButton");
const deleteButton = document.getElementById("deleteButton");

const dialog = document.getElementById("resultDialog");
const seal = document.getElementById("resultSeal");
const headline = document.getElementById("resultHeadline");
const detail = document.getElementById("resultDetail");

const deleteDialog = document.getElementById("deleteDialog");

const attachHistory = document.getElementById("attachHistory");
const attachList = document.getElementById("attachList");
const attachEmpty = document.getElementById("attachEmpty");
const attachMessage = document.getElementById("attachMessage");
const attachDeleteDialog = document.getElementById("attachDeleteDialog");
const attachDeleteDetail = document.getElementById("attachDeleteDetail");
// 消す確認をしている履歴（{ id, attachedOn }）。
let pendingAttachDelete = null;

let rating = 0;
let existingUrls = [];
// 選んだ直後に圧縮した写真（J-22）。送信のときに元のファイルを読み直さない。要素は { blob, url }。
let selectedPhotos = [];
// 圧縮中の枚数。上限の判定と枚数表示に含める。
let pendingCount = 0;
let photosReady = Promise.resolve();
let photoProblem = "";
// 「すべて取り消す」などで選択をやり直したら増やし、それより前の圧縮の結果を捨てる。
let selectionId = 0;
let callbacks = {
  onUnauthorized: () => {},
  onSaved: () => {},
  onShowZukan: () => {},
  onShowRegister: () => {},
  onDeleted: () => {},
};

// 修正中の記録。null なら新規登録。
let editing = null;
let lastSavedItemId = null;

function todayLocal() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ---------- ★ ----------

function setRating(value) {
  rating = value;
  ratingGroup.querySelectorAll("button").forEach((button, index) => {
    button.classList.toggle("on", index < value);
    button.setAttribute("aria-checked", String(index + 1 === value));
  });
}

for (let i = 1; i <= 5; i += 1) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "★";
  button.setAttribute("role", "radio");
  button.setAttribute("aria-label", `★${i}`);
  button.setAttribute("aria-checked", "false");
  button.addEventListener("click", () => setRating(i));
  ratingGroup.append(button);
}

// ---------- 都道府県 ----------

function fillPrefSelect(select, regions, wideAreas = []) {
  select.textContent = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "選んでください";
  select.append(placeholder);
  for (const region of regions) {
    const group = document.createElement("optgroup");
    group.label = region.name;
    for (const pref of region.prefs) {
      const option = document.createElement("option");
      option.value = pref.code;
      option.textContent = pref.name;
      group.append(option);
    }
    select.append(group);
  }
  if (wideAreas.length > 0) {
    const group = document.createElement("optgroup");
    group.label = "広域（県をまたぐ商品）";
    for (const label of wideAreas) {
      const option = document.createElement("option");
      option.value = `${WIDE_PREFIX}${label}`;
      option.textContent = label;
      group.append(option);
    }
    select.append(group);
  }
}

export async function prepareRegisterForm() {
  const res = await fetchPrefectures();
  if (!res.ok) {
    throw new Error(`都道府県を読み込めませんでした（HTTP ${res.status}）`);
  }
  const { regions, wideAreas } = await res.json();
  fillPrefSelect(prefSelect, regions, wideAreas);
  fillPrefSelect(purchasePrefSelect, regions);
  dateInput.max = todayLocal();
  resetForm();
}

export function setRegisterCallbacks(next) {
  callbacks = { ...callbacks, ...next };
}

// ---------- 写真（選択・取り消し） ----------

function keptPhotoCount() {
  return editing ? editing.photoCount - editing.removePhotoIds.size : 0;
}

function updatePhotoCount() {
  const total = keptPhotoCount() + selectedPhotos.length + pendingCount;
  const preparing = pendingCount > 0 ? "（準備中）" : "";
  photoCount.textContent = total > 0 ? `写真 ${total}/${MAX_PHOTOS}枚${preparing}` : "";
}

function renderSelectedPhotos() {
  photoPreview.textContent = "";
  for (const photo of selectedPhotos) {
    const box = document.createElement("div");
    box.className = "photo-thumb";
    const img = document.createElement("img");
    img.src = photo.url;
    img.alt = "選んだ写真";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "photo-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "この写真を外す");
    remove.addEventListener("click", () => removeSelectedPhoto(photo));
    box.append(img, remove);
    photoPreview.append(box);
  }
  clearPhotosButton.hidden = selectedPhotos.length === 0;
  updatePhotoCount();
}

function removeSelectedPhoto(photo) {
  URL.revokeObjectURL(photo.url);
  selectedPhotos = selectedPhotos.filter((p) => p !== photo);
  photoInput.value = "";
  message.textContent = "";
  renderSelectedPhotos();
}

function clearSelectedPhotos() {
  selectionId += 1;
  selectedPhotos.forEach((photo) => URL.revokeObjectURL(photo.url));
  selectedPhotos = [];
  pendingCount = 0;
  photosReady = Promise.resolve();
  photoProblem = "";
  photoInput.value = "";
  renderSelectedPhotos();
}

async function preparePhotos(files, id) {
  for (const file of files) {
    let compressed = null;
    let failure = null;
    try {
      compressed = await compressImage(file);
    } catch (err) {
      failure = err;
    }
    if (id !== selectionId) {
      return;
    }
    pendingCount -= 1;
    if (failure) {
      // 開けなかった写真だけ外す。理由は送信のときにもう一度見せる。
      photoProblem = failure.message;
      message.textContent = failure.message;
    } else {
      selectedPhotos.push({ blob: compressed, url: URL.createObjectURL(compressed) });
    }
    renderSelectedPhotos();
  }
}

photoInput.addEventListener("change", () => {
  const files = [...photoInput.files];
  // 同じファイルをもう一度選んでも change が起きるように、すぐ空にする（File は手元に持っている）。
  photoInput.value = "";
  if (files.length === 0) {
    return;
  }
  const room = MAX_PHOTOS - keptPhotoCount() - selectedPhotos.length - pendingCount;
  if (files.length > room) {
    message.textContent =
      room > 0
        ? `写真は${MAX_PHOTOS}枚までです。あと${room}枚選べます。`
        : `写真は${MAX_PHOTOS}枚までです。追加するときは、どれかを外してください。`;
    return;
  }
  pendingCount += files.length;
  updatePhotoCount();
  const id = selectionId;
  photosReady = photosReady.then(() => preparePhotos(files, id));
});

clearPhotosButton.addEventListener("click", () => {
  clearSelectedPhotos();
  message.textContent = "";
});

// ---------- 初期状態 ----------

function leaveEdit() {
  editing = null;
  clearAttachHistory();
  clearExistingPhotos();
  editBanner.hidden = true;
  deleteButton.hidden = true;
  submitButton.textContent = "登録して照合する";
}

// 全項目を初期状態に戻す（J-23）。購入日は空欄、都道府県は「選んでください」。
function resetForm() {
  if (editing) {
    leaveEdit();
  }
  clearSelectedPhotos();
  nameInput.value = "";
  prefSelect.value = "";
  codeInput.value = "";
  setRating(0);
  dateInput.value = "";
  purchasePrefSelect.value = "";
  placeInput.value = "";
  memoInput.value = "";
  message.textContent = "";
}

// 図鑑タブから登録タブを開いたときに呼ぶ。
export function resetRegisterForm() {
  resetForm();
}

// 図鑑の「？？？」枠から開いたときに呼ぶ（J-25）。初期状態にしてから商品の県だけ選ぶ。
export function startRegisterFor({ isWide, code }) {
  resetForm();
  const value = isWide ? `${WIDE_PREFIX}${code}` : code;
  prefSelect.value = value;
  if (prefSelect.value !== value) {
    prefSelect.value = "";
    message.textContent = "この枠の都道府県を選べませんでした。手で選んでください。";
  }
  callbacks.onShowRegister();
  window.scrollTo(0, 0);
}

// ---------- カバンに付けた日の履歴（J-27） ----------

function clearAttachHistory() {
  attachList.textContent = "";
  attachMessage.textContent = "";
  attachHistory.hidden = true;
}

function renderAttachHistory(attachments) {
  attachList.textContent = "";
  attachEmpty.hidden = attachments.length > 0;
  for (const attachment of attachments) {
    const row = document.createElement("li");
    row.className = "attach-row";
    const label = document.createElement("span");
    label.textContent = describeAttachedOn(attachment.attachedOn);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button button-small";
    remove.textContent = "消す";
    remove.setAttribute("aria-label", `${attachment.attachedOn} の記録を消す`);
    remove.addEventListener("click", () => {
      pendingAttachDelete = attachment;
      attachDeleteDetail.textContent = `${attachment.attachedOn} に付けた記録を消します。`;
      attachDeleteDialog.showModal();
    });
    row.append(label, remove);
    attachList.append(row);
  }
  attachHistory.hidden = false;
}

async function loadAttachHistory(itemId) {
  try {
    const res = await fetchAttachments(itemId);
    if (res.status === 401) {
      callbacks.onUnauthorized();
      return;
    }
    if (!editing || editing.id !== itemId) {
      return; // 読み込み中に別の記録へ移った
    }
    if (!res.ok) {
      renderAttachHistory([]);
      attachMessage.textContent = `付けた日の履歴を読み込めませんでした（HTTP ${res.status}）。`;
      return;
    }
    renderAttachHistory((await res.json()).attachments);
  } catch {
    if (editing && editing.id === itemId) {
      renderAttachHistory([]);
      attachMessage.textContent = "付けた日の履歴を読み込めませんでした。通信を確認してください。";
    }
  }
}

document.getElementById("attachDeleteCancel").addEventListener("click", () => {
  pendingAttachDelete = null;
  attachDeleteDialog.close();
});
document.getElementById("attachDeleteConfirm").addEventListener("click", async () => {
  attachDeleteDialog.close();
  const target = pendingAttachDelete;
  pendingAttachDelete = null;
  if (!target || !editing) {
    return;
  }
  const itemId = editing.id;
  try {
    const res = await deleteAttachment(target.id);
    if (res.status === 401) {
      callbacks.onUnauthorized();
      return;
    }
    if (!res.ok && res.status !== 404) {
      attachMessage.textContent = `消せませんでした（HTTP ${res.status}）。もう一度押してください。`;
      return;
    }
    await loadAttachHistory(itemId);
    attachMessage.textContent = `${target.attachedOn} の記録を消しました。`;
  } catch {
    attachMessage.textContent = "サーバーに接続できません。通信を確認してもう一度押してください。";
  }
});

// ---------- 修正（D-19） ----------

function clearExistingPhotos() {
  existingUrls.forEach((url) => URL.revokeObjectURL(url));
  existingUrls = [];
  existingPhotos.textContent = "";
  existingPhotos.hidden = true;
}

function renderExistingPhotos(photoIds) {
  clearExistingPhotos();
  existingPhotos.hidden = false;
  for (const photoId of photoIds) {
    const box = document.createElement("div");
    box.className = "existing-photo";
    const img = document.createElement("img");
    img.alt = "登録済みの写真";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "button";
    toggle.textContent = "外す";
    toggle.addEventListener("click", () => {
      const removing = !editing.removePhotoIds.has(photoId);
      if (removing) {
        editing.removePhotoIds.add(photoId);
      } else {
        editing.removePhotoIds.delete(photoId);
      }
      box.classList.toggle("is-removed", removing);
      toggle.textContent = removing ? "戻す" : "外す";
      message.textContent = "";
      updatePhotoCount();
    });
    box.append(img, toggle);
    existingPhotos.append(box);
    fetchPhoto(photoId)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          existingUrls.push(url);
          img.src = url;
        }
      })
      .catch(() => {
        // 写真の下見が出ないだけなので、修正は続けられる。
      });
  }
}

export async function startEdit(itemId) {
  const res = await fetchItem(itemId);
  if (res.status === 401) {
    callbacks.onUnauthorized();
    return;
  }
  if (!res.ok) {
    throw new Error(`記録を読み込めませんでした（HTTP ${res.status}）`);
  }
  const item = await res.json();

  resetForm();
  editing = { id: item.id, photoCount: item.photoIds.length, removePhotoIds: new Set() };
  nameInput.value = item.inputName;
  prefSelect.value = item.wideArea ? `${WIDE_PREFIX}${item.wideArea}` : item.prefCode;
  codeInput.value = item.code;
  setRating(item.rating);
  dateInput.value = item.purchasedOn;
  purchasePrefSelect.value = item.purchasePrefCode;
  placeInput.value = item.placeName || "";
  memoInput.value = item.memo || "";
  renderExistingPhotos(item.photoIds);
  updatePhotoCount();
  loadAttachHistory(item.id);

  editBanner.hidden = false;
  deleteButton.hidden = false;
  submitButton.textContent = "修正を保存して照合する";
  callbacks.onShowRegister();
  window.scrollTo(0, 0);
}

export function cancelEdit() {
  if (editing) {
    resetForm();
  }
}

editCancelButton.addEventListener("click", cancelEdit);

// ---------- 削除（D-19） ----------

deleteButton.addEventListener("click", () => deleteDialog.showModal());
document.getElementById("deleteCancel").addEventListener("click", () => deleteDialog.close());
document.getElementById("deleteConfirm").addEventListener("click", async () => {
  deleteDialog.close();
  message.textContent = "";
  try {
    const res = await deleteItem(editing.id);
    if (res.status === 401) {
      callbacks.onUnauthorized();
      return;
    }
    if (!res.ok) {
      const data = await res.json();
      message.textContent = data.error || `削除できませんでした（HTTP ${res.status}）。`;
      return;
    }
    resetForm();
    callbacks.onDeleted();
  } catch {
    message.textContent = "サーバーに接続できません。通信を確認してもう一度押してください。";
  }
});

// ---------- 送信 ----------

// 直している最中に古いエラーを残さない。
form.addEventListener("input", () => {
  message.textContent = "";
});
ratingGroup.addEventListener("click", () => {
  message.textContent = "";
});

function validateBeforeSend() {
  const total = keptPhotoCount() + selectedPhotos.length;
  if (total === 0) return "写真を1枚以上選んでください。";
  if (total > MAX_PHOTOS) return `写真は${MAX_PHOTOS}枚までです。`;
  if (!nameInput.value.trim()) return "名前を入力してください。";
  if (!prefSelect.value) return "商品の都道府県か広域を選んでください。";
  const code = codeInput.value.normalize("NFKC").replace(/\s/g, "");
  if (code && !CODE_PATTERN.test(code)) return "JANは13桁、品番は「CKW 12345」か数字5桁で入力してください。";
  if (rating === 0) return "★を選んでください。";
  if (!dateInput.value) return "購入日を入れてください。";
  if (!purchasePrefSelect.value) return "買った都道府県を選んでください。";
  return "";
}

function showResult(result) {
  seal.className = "seal";
  const { pref, completionEvent } = result;
  const progress = pref.surveying ? `${pref.name}は調査中です` : `${pref.name} ${pref.owned}/${pref.total}`;
  const prefix = result.edited ? "修正しました。" : "";

  if (!result.matched) {
    seal.classList.add("seal-unmatched");
    seal.textContent = "未照合";
    headline.textContent = "マスタに見つかりませんでした。新商品かも？";
    detail.textContent = `${prefix}「${result.inputName}」を${pref.nameFull}の未照合として保存しました。マスタに追加されると自動で照合します。`;
  } else if (completionEvent === "completed" || completionEvent === "recompleted") {
    seal.classList.add("seal-complete");
    seal.textContent = completionEvent === "recompleted" ? "再制覇" : "制覇";
    headline.textContent =
      completionEvent === "recompleted"
        ? `👑 ${pref.nameFull} 再コンプリート！`
        : `👑 ${pref.nameFull} コンプリート！`;
    detail.textContent = `${prefix}「${result.product.name}」と一致。${progress}`;
  } else {
    seal.textContent = "一致";
    headline.textContent = `🎉 ${pref.nameFull}「${result.product.name}」と一致！`;
    detail.textContent = `${prefix}${progress}`;
  }
  dialog.showModal();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const idleLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "写真を準備しています…";
  await photosReady;
  submitButton.disabled = false;
  submitButton.textContent = idleLabel;

  const problem = photoProblem || validateBeforeSend();
  photoProblem = "";
  if (problem) {
    message.textContent = problem;
    return;
  }

  message.textContent = "";
  submitButton.disabled = true;
  submitButton.textContent = "照合しています…";
  try {
    const body = new FormData();
    body.set("name", nameInput.value.trim());
    if (prefSelect.value.startsWith(WIDE_PREFIX)) {
      body.set("wideArea", prefSelect.value.slice(WIDE_PREFIX.length));
    } else {
      body.set("prefCode", prefSelect.value);
    }
    body.set("code", codeInput.value.trim());
    body.set("purchasePrefCode", purchasePrefSelect.value);
    body.set("placeName", placeInput.value.trim());
    body.set("purchasedOn", dateInput.value);
    body.set("rating", String(rating));
    body.set("memo", memoInput.value.trim());
    for (const photo of selectedPhotos) {
      body.append("photos", photo.blob, "photo.jpg");
    }
    if (editing) {
      editing.removePhotoIds.forEach((id) => body.append("removePhotoIds", id));
    }

    const res = editing ? await patchItem(editing.id, body) : await postItem(body);
    if (res.status === 401) {
      // 入力は消さない。ログインし直したら、そのまま送り直せる。
      callbacks.onUnauthorized();
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      message.textContent = data.error || `保存できませんでした（HTTP ${res.status}）。`;
      return;
    }
    lastSavedItemId = data.itemId;
    // 保存できたらすぐ初期状態に戻す（結果の画面を Esc で閉じても、同じ内容を二重に送らないように）。
    submitButton.disabled = false;
    resetForm();
    callbacks.onSaved();
    showResult(data);
  } catch (err) {
    message.textContent =
      err instanceof TypeError
        ? "サーバーに接続できません。通信を確認してもう一度押してください。"
        : err.message;
  } finally {
    submitButton.disabled = false;
    if (submitButton.textContent === "照合しています…") {
      submitButton.textContent = idleLabel;
    }
  }
});

document.getElementById("resultContinue").addEventListener("click", () => {
  dialog.close();
  window.scrollTo(0, 0);
});
document.getElementById("resultToZukan").addEventListener("click", () => {
  dialog.close();
  callbacks.onShowZukan();
});
document.getElementById("resultEdit").addEventListener("click", async () => {
  dialog.close();
  try {
    await startEdit(lastSavedItemId);
  } catch (err) {
    message.textContent = err.message;
  }
});
