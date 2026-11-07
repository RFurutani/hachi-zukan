// バージョンはここだけに書く。
export const APP_VERSION = "0.1.0";

// OAuthクライアントIDは公開情報（docs/release-procedure.md）。
export const GOOGLE_CLIENT_ID = "542926513085-rf11sfhm3qqp5om4mdtqm26osi81imjr.apps.googleusercontent.com";
export const IS_GOOGLE_CONFIGURED = !GOOGLE_CLIENT_ID.startsWith("REPLACE_");

const IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";

export const API_BASE = IS_LOCAL
  ? "http://localhost:8797"
  : "https://hachi-zukan-api.ryo-furutani.workers.dev";
