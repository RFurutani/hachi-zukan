// 画面の版はここだけに書く。Worker の worker/src/version.js と同じ値にする（公開するたびに上げる）。
export const APP_VERSION = "0.2.0";

// OAuthクライアントIDは公開情報（docs/release-procedure.md）。
export const GOOGLE_CLIENT_ID = "542926513085-rf11sfhm3qqp5om4mdtqm26osi81imjr.apps.googleusercontent.com";
export const IS_GOOGLE_CONFIGURED = !GOOGLE_CLIENT_ID.startsWith("REPLACE_");

const IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";

export const API_BASE = IS_LOCAL
  ? "http://localhost:8797"
  : "https://hachi-zukan-api.ryo-furutani.workers.dev";
