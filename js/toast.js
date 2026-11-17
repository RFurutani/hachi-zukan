// 画面の下に出す短いお知らせ（J-31）。「取り消す」を付けられる。表示は1つだけで、新しいものが古いものを置き換える。
// 文字はすべて textContent で出す（S-04）。
export const TOAST_MS = 5000;

const toastEl = document.getElementById("toast");
const textEl = document.getElementById("toastText");
const undoButton = document.getElementById("toastUndo");

let timer = null;
let undoAction = null;

export function hideToast() {
  clearTimeout(timer);
  timer = null;
  undoAction = null;
  toastEl.hidden = true;
  textEl.textContent = "";
  undoButton.hidden = true;
}

// onUndo を渡したときだけ「取り消す」を出す。置き換えられた古いお知らせの取り消しは、もう押せない。
export function showToast(text, { onUndo = null, durationMs = TOAST_MS } = {}) {
  clearTimeout(timer);
  textEl.textContent = text;
  undoAction = onUndo;
  undoButton.hidden = !onUndo;
  undoButton.disabled = false;
  toastEl.hidden = false;
  timer = setTimeout(hideToast, durationMs);
}

undoButton.addEventListener("click", () => {
  const action = undoAction;
  if (!action) {
    return;
  }
  // 2回押しても1回だけ動く。結果は action が新しいお知らせで伝える。
  undoButton.disabled = true;
  hideToast();
  action();
});
