window.CONFIG = {
  GAS_ENDPOINT: "https://script.google.com/macros/s/您的部署ID/exec",
  API_KEY: "MY_SECRET_KEY_2026" // 🔥 新增這行，跟 GAS 屬性一致
};

// config.js
window.GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbwPDqm4YawpB5vgOOG9qqPA51-u_vCb-bbfr-91k6EtjkN6ZDrjTlK9-xBpwxtmuVAQkA/exec";

// 統一用 window.CONFIG
window.CONFIG = window.CONFIG || {};
window.CONFIG.GAS_ENDPOINT = window.GAS_ENDPOINT;
