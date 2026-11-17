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

// カバンの期間（J-28）。日数は Worker が日本時間で数えた値をそのまま使う。
// 「2026-11-10〜今日（継続中）」「2026-11-05〜2026-11-09」「2026-11-14（同じ日に付け替え）」
export function describePeriod(period) {
  if (period.current) {
    return `${period.from}〜今日（継続中）`;
  }
  if (period.sameDay) {
    return `${period.from}（同じ日に付け替え）`;
  }
  return period.from === period.to ? period.from : `${period.from}〜${period.to}`;
}

// 継続中は「5日目」、終わった期間は「5日」。
export function describePeriodDays(period) {
  return period.current ? `${period.days}日目` : `${period.days}日`;
}

export function describeAttachTotals(count, days) {
  return `付けた回数：${count}回／合計：${days}日`;
}
