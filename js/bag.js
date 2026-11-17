// 「🎒 カバン」タブ（F1・J-28）。付けた記録を新しい順に、期間・名前・日数で並べる。並べ替えはしない（F2）。
// 名前は本人の所有品（または本人の入力）だけ。サーバーの値はすべて textContent で出す（S-04）。
import { fetchBag } from "./api.js";
import { describePeriod, describePeriodDays } from "./dates.js";

const listEl = document.getElementById("bagList");
const messageEl = document.getElementById("bagMessage");
let onUnauthorized = () => {};

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function bagRow(period) {
  const row = el("li", `bag-row${period.current ? " bag-row-current" : ""}`);
  if (period.current) {
    row.append(el("span", "bag-row-badge", "今付けている"));
  }
  row.append(
    el("span", "bag-row-period", describePeriod(period)),
    el("span", "bag-row-name", period.name),
    el("span", "bag-row-days", describePeriodDays(period))
  );
  return row;
}

export function setBagUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export async function refreshBag() {
  messageEl.textContent = "読み込んでいます…";
  try {
    const res = await fetchBag();
    if (res.status === 401) {
      onUnauthorized();
      return;
    }
    if (!res.ok) {
      messageEl.textContent = `カバンの記録を読み込めませんでした（HTTP ${res.status}）。もう一度開いてください。`;
      return;
    }
    const { periods } = await res.json();
    listEl.textContent = "";
    periods.forEach((period) => listEl.append(bagRow(period)));
    messageEl.textContent = periods.length === 0 ? "まだ記録がありません。図鑑の「🎒 今日付けた」で記録できます。" : "";
  } catch {
    messageEl.textContent = "サーバーに接続できません。通信を確認してもう一度開いてください。";
  }
}

export function clearBag() {
  listEl.textContent = "";
  messageEl.textContent = "";
}
