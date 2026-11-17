// 入口。ログイン状態の管理と画面の切り替えを行う。
import { fetchMe } from "./api.js";
import { APP_VERSION, GOOGLE_CLIENT_ID, IS_GOOGLE_CONFIGURED } from "./config.js";
import { saveIdToken, loadIdToken, clearIdToken, isExpired } from "./token-store.js";
import {
  refreshZukan,
  clearZukan,
  setZukanAttachChangedHandler,
  setZukanEditHandler,
  setZukanRegisterHandler,
  setZukanUnauthorizedHandler,
} from "./zukan.js";
import { hideToast } from "./toast.js";
import {
  cancelEdit,
  prepareRegisterForm,
  resetRegisterForm,
  setRegisterCallbacks,
  startEdit,
  startRegisterFor,
} from "./register.js";
import { clearBag, refreshBag, setBagUnauthorizedHandler } from "./bag.js";
import "./diagnostics.js";

const loginScreen = document.getElementById("loginScreen");
const mainScreen = document.getElementById("mainScreen");
const loginMessage = document.getElementById("loginMessage");
const appTitle = document.getElementById("appTitle");
const logoutButton = document.getElementById("logoutButton");
const tabZukan = document.getElementById("tabZukan");
const tabRegister = document.getElementById("tabRegister");
const zukanView = document.getElementById("zukanView");
const registerView = document.getElementById("registerView");
const tabBag = document.getElementById("tabBag");
const bagView = document.getElementById("bagView");
const TABS = [
  { name: "zukan", tab: tabZukan, view: zukanView },
  { name: "register", tab: tabRegister, view: registerView },
  { name: "bag", tab: tabBag, view: bagView },
];

const NEUTRAL_TITLE = "hachi-zukan";
let formPrepared = false;

document.getElementById("versionLabel").textContent = `v${APP_VERSION}`;

function showLogin(text) {
  loginScreen.hidden = false;
  mainScreen.hidden = true;
  logoutButton.hidden = true;
  loginMessage.textContent = text;
  document.title = NEUTRAL_TITLE;
}

function showTab(name) {
  for (const { name: tabName, tab, view } of TABS) {
    view.hidden = tabName !== name;
    tab.setAttribute("aria-pressed", String(tabName === name));
  }
}

async function checkLoginState() {
  const idToken = loadIdToken();
  if (!idToken || isExpired(idToken)) {
    clearIdToken();
    showLogin(idToken ? "ログインの期限が切れました。もう一度ログインしてください。" : "");
    return;
  }

  showLogin("ログイン状態を確認しています…");
  try {
    const res = await fetchMe();
    if (res.status === 401) {
      clearIdToken();
      showLogin("もう一度ログインしてください。");
      return;
    }
    if (res.status === 403) {
      clearIdToken();
      showLogin("このアカウントは利用を許可されていません。");
      return;
    }
    if (!res.ok) {
      showLogin(`サーバーでエラーが起きました（HTTP ${res.status}）。時間をおいて再読み込みしてください。`);
      return;
    }
    const me = await res.json();

    // C-05：この題名はログイン後にサーバーから受け取る。
    appTitle.textContent = me.appTitle;
    document.title = me.appTitle;
    loginScreen.hidden = true;
    mainScreen.hidden = false;
    logoutButton.hidden = false;

    // ログインし直しのときは入力中の内容を消さない。
    if (!formPrepared) {
      // 前回の入力は引き継がない（J-23）。/api/me の lastInput は使わない。
      await prepareRegisterForm();
      formPrepared = true;
    }
    await refreshZukan();
  } catch {
    showLogin("サーバーに接続できません。通信を確認して再読み込みしてください。");
  }
}

function handleExpiredSession() {
  hideToast();
  clearIdToken();
  showLogin("ログインの期限が切れました。もう一度ログインすると、入力の続きから送れます。");
}

async function loginWith(token) {
  saveIdToken(token);
  await checkLoginState();
}

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", reject, { once: true });
    document.head.append(script);
  });
}

async function setupGoogleLogin() {
  try {
    await loadGoogleScript();
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => loginWith(response.credential),
    });
    google.accounts.id.renderButton(document.getElementById("googleButton"), {
      theme: "outline",
      size: "large",
    });
  } catch {
    showLogin("Googleログインを読み込めませんでした。通信を確認して再読み込みしてください。");
  }
}

tabZukan.addEventListener("click", () => {
  showTab("zukan");
  refreshZukan();
});
tabRegister.addEventListener("click", () => {
  // 図鑑から登録を開いたときは初期状態にする（J-23）。登録を開いている最中に押しても消さない。
  if (registerView.hidden) {
    resetRegisterForm();
  }
  showTab("register");
});
tabBag.addEventListener("click", () => {
  showTab("bag");
  refreshBag();
});
logoutButton.addEventListener("click", () => {
  cancelEdit();
  // ログアウトしたあとに「取り消す」を押せないようにする。
  hideToast();
  clearIdToken();
  clearZukan();
  clearBag();
  appTitle.textContent = "";
  showLogin("ログアウトしました。");
  formPrepared = false;
  showTab("zukan");
});

setZukanUnauthorizedHandler(handleExpiredSession);
setZukanAttachChangedHandler(() => {
  if (!bagView.hidden) {
    refreshBag();
  }
});
setBagUnauthorizedHandler(handleExpiredSession);
setRegisterCallbacks({
  onUnauthorized: handleExpiredSession,
  onSaved: () => refreshZukan(),
  onShowZukan: () => showTab("zukan"),
  onShowRegister: () => showTab("register"),
  onDeleted: () => {
    showTab("zukan");
    refreshZukan("記録を削除しました。");
  },
});
setZukanRegisterHandler(startRegisterFor);
setZukanEditHandler((itemId) => {
  startEdit(itemId).catch((err) => refreshZukan(err.message));
});

if (IS_GOOGLE_CONFIGURED) {
  setupGoogleLogin();
}
checkLoginState().then(() => {
  if (!IS_GOOGLE_CONFIGURED && !loadIdToken()) {
    loginMessage.textContent = "ログインの設定が済んでいません。";
  }
});
