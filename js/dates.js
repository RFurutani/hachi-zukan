// 日付の表示。「今日」は端末の時間帯に関係なく日本時間で決める（J-27）。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function todayInJapan(now = Date.now()) {
  return new Date(now + JST_OFFSET_MS).toISOString().slice(0, 10);
}

// YYYY-MM-DD 同士の日数の差。日付だけで数えるので、時刻や夏時間に左右されない。
export function daysBetween(fromDate, toDate) {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / DAY_MS);
}

// 「2026-11-10（3日前）」。当日は「今日」。
export function describeAttachedOn(attachedOn, now = Date.now()) {
  const days = daysBetween(attachedOn, todayInJapan(now));
  return `${attachedOn}（${days <= 0 ? "今日" : `${days}日前`}）`;
}
