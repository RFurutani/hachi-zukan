// 登録画面（F-01・連続登録）、記録の修正・削除（D-19）、照合結果の演出（F-02）。
// 表示は textContent のみ（S-04）。
import { deleteItem, fetchItem, fetchPhoto, fetchPrefectures, patchItem, postItem } from "./api.js";
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
const nameInput = document.getElementById("nameInput");
const prefSelect = document.getElementById("prefSelect");
const codeInput = document.getElementById("codeInput");
const purchasePrefSelect = document.getElementById("purchasePrefSelect");
const dateInput = document.getElementById("dateInput");
const placeInput = document.getElementById("placeInput");
const memoInput = document.getElementById("memoInput");
const ratingGroup = document.getElementById("ratingGroup");
const carryNote = document.getElementById("carryNote");
const message = document.getElementById("registerMessage");
const submitButton = document.getElementById("registerButton");
const deleteButton = document.getElementById("deleteButton");

const dialog = document.getElementById("resultDialog");
const seal = document.getElementById("resultSeal");
const headline = document.getElementById("resultHeadline");
const detail = document.getElementById("resultDetail");

const deleteDialog = document.getElementById("deleteDialog");

let rating = 0;
let previewUrls = [];
let existingUrls = [];
let callbacks = {
  onUnauthorized: () => {},
  onSaved: () => {},
  onShowZukan: () => {},
  onShowRegister: () => {},
  onDeleted: () => {},
};

// 修正中の記録。null なら新規登録。
let editing = null;
// 修正に入る前の「買った日と場所」。修正が終わったら連続登録の値に戻す。
let carrySnapshot = null;
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

export async function prepareRegisterForm(lastInput) {
  const res = await fetchPrefectures();
  if (!res.ok) {
    throw new Error(`都道府県を読み込めませんでした（HTTP ${res.status}）`);
  }
  const { regions, wideAreas } = await res.json();
  fillPrefSelect(prefSelect, regions, wideAreas);
  fillPrefSelect(purchasePrefSelect, regions);

  dateInput.max = todayLocal();
  if (lastInput) {
    // 前回の日付と買った場所を引き継ぐ。別の日に買った分のために、引き継いだことを明示する。
    dateInput.value = lastInput.purchasedOn;
    purchasePrefSelect.value = lastInput.purchasePrefCode;
    placeInput.value = lastInput.placeName || "";
    carryNote.textContent = "前回の登録から引き継いでいます。違うときは書き換えてください。";
    carryNote.hidden = false;
  } else {
    dateInput.value = todayLocal();
    carryNote.hidden = true;
  }
}

export function setRegisterCallbacks(next) {
  callbacks = { ...callbacks, ...next };
}

// ---------- 写真の下見 ----------

function clearPreview() {
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
  previewUrls = [];
  photoPreview.textContent = "";
}

photoInput.addEventListener("change", () => {
  clearPreview();
  for (const file of [...photoInput.files].slice(0, MAX_PHOTOS)) {
    const url = URL.createObjectURL(file);
    previewUrls.push(url);
    const img = document.createElement("img");
    img.src = url;
    img.alt = "選んだ写真";
    photoPreview.append(img);
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

  if (!editing) {
    carrySnapshot = {
      date: dateInput.value,
      purchasePref: purchasePrefSelect.value,
      place: placeInput.value,
      noteText: carryNote.textContent,
      noteHidden: carryNote.hidden,
    };
  }
  editing = { id: item.id, photoCount: item.photoIds.length, removePhotoIds: new Set() };

  photoInput.value = "";
  clearPreview();
  nameInput.value = item.inputName;
  prefSelect.value = item.wideArea ? `${WIDE_PREFIX}${item.wideArea}` : item.prefCode;
  codeInput.value = item.code;
  setRating(item.rating);
  dateInput.value = item.purchasedOn;
  purchasePrefSelect.value = item.purchasePrefCode;
  placeInput.value = item.placeName || "";
  memoInput.value = item.memo || "";
  message.textContent = "";
  carryNote.hidden = true;
  renderExistingPhotos(item.photoIds);

  editBanner.hidden = false;
  deleteButton.hidden = false;
  submitButton.textContent = "修正を保存して照合する";
  callbacks.onShowRegister();
  window.scrollTo(0, 0);
}

function leaveEdit() {
  editing = null;
  clearExistingPhotos();
  editBanner.hidden = true;
  deleteButton.hidden = true;
  submitButton.textContent = "登録して照合する";
  if (carrySnapshot) {
    dateInput.value = carrySnapshot.date;
    purchasePrefSelect.value = carrySnapshot.purchasePref;
    placeInput.value = carrySnapshot.place;
    carryNote.textContent = carrySnapshot.noteText;
    carryNote.hidden = carrySnapshot.noteHidden;
    carrySnapshot = null;
  }
}

// 商品ごとに違う項目だけ空にする。
function clearItemFields() {
  photoInput.value = "";
  clearPreview();
  nameInput.value = "";
  codeInput.value = "";
  prefSelect.value = "";
  memoInput.value = "";
  setRating(0);
  message.textContent = "";
}

export function cancelEdit() {
  if (editing) {
    leaveEdit();
    clearItemFields();
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
    leaveEdit();
    clearItemFields();
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
  const kept = editing ? editing.photoCount - editing.removePhotoIds.size : 0;
  const total = kept + photoInput.files.length;
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

function resetForNext() {
  // 日付と買った場所は残す。商品の県は選び間違えると「新商品かも」と誤判定されるので、毎回選び直してもらう。
  if (editing) {
    leaveEdit();
  } else {
    carryNote.textContent = "買った日と場所は前回のままです。違うときは書き換えてください。";
    carryNote.hidden = false;
  }
  clearItemFields();
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
  const problem = validateBeforeSend();
  if (problem) {
    message.textContent = problem;
    return;
  }

  const idleLabel = submitButton.textContent;
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
    for (const file of photoInput.files) {
      body.append("photos", await compressImage(file), "photo.jpg");
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
    callbacks.onSaved();
    showResult(data);
  } catch (err) {
    message.textContent =
      err instanceof TypeError
        ? "サーバーに接続できません。通信を確認してもう一度押してください。"
        : err.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = idleLabel;
  }
});

document.getElementById("resultContinue").addEventListener("click", () => {
  dialog.close();
  resetForNext();
  window.scrollTo(0, 0);
});
document.getElementById("resultToZukan").addEventListener("click", () => {
  dialog.close();
  resetForNext();
  callbacks.onShowZukan();
});
document.getElementById("resultEdit").addEventListener("click", async () => {
  dialog.close();
  const wasEditing = Boolean(editing);
  if (!wasEditing) {
    // 連続登録の「買った日と場所」は、修正が終わったら元に戻す。
    carryNote.textContent = "買った日と場所は前回のままです。違うときは書き換えてください。";
    carryNote.hidden = false;
  }
  try {
    await startEdit(lastSavedItemId);
  } catch (err) {
    message.textContent = err.message;
  }
});
