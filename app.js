/* app.js - JSONP 版（解 CORS） */
const ENDPOINT = window.CONFIG?.GAS_ENDPOINT || window.GAS_ENDPOINT;
const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const whoEl = $("who");
const locEl = $("loc");

// ========== JSONP 核心 ==========
function jsonpCall(payload) {
  return new Promise((resolve, reject) => {
    if (!ENDPOINT) return reject(new Error("缺少 GAS_ENDPOINT"));

    const cbName = "cb_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
    window[cbName] = (resp) => {
      cleanup();
      resolve(resp);
    };

    const cleanup = () => {
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      if (script && script.parentNode) script.parentNode.removeChild(script);
      if (timer) clearTimeout(timer);
    };

    const qs = new URLSearchParams();
    qs.set("callback", cbName);
    qs.set("payload", JSON.stringify(payload));

    const script = document.createElement("script");
    script.src = ENDPOINT + "?" + qs.toString();
    script.onerror = () => { cleanup(); reject(new Error("網路連線失敗（JSONP）")); };
    document.body.appendChild(script);

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("請求逾時（JSONP）"));
    }, 20000);
  });
}

async function callApi(payload) {
  return await jsonpCall(payload);
}

function setStatus(msg, ok) {
  if (!statusEl) return;
  statusEl.innerHTML = msg;
  statusEl.className = "status " + (ok ? "ok" : "bad");
  statusEl.style.display = "block";
  setTimeout(() => { statusEl.style.display = "none"; }, 3000);
}

function getUser() {
  return {
    userId: localStorage.getItem("employeeId"),
    displayName: localStorage.getItem("employeeName")
  };
}

window.logout = function () {
  if (confirm("確定要登出嗎？")) {
    localStorage.removeItem("employeeId");
    localStorage.removeItem("employeeName");
    location.href = "login.html";
  }
};

// 載入儀表板數據
async function loadDashboard() {
  const { userId, displayName } = getUser();
  if (!userId) return;

  if ($("dispAnnualLeft")) $("dispAnnualLeft").textContent = "...";
  if ($("dispCompLeft")) $("dispCompLeft").textContent = "...";

  try {
    const res = await callApi({ action: "get_dashboard", userId, displayName });
    if (res.ok && res.data) {
      if ($("dispAnnualLeft")) $("dispAnnualLeft").textContent = res.data.annual.left + " 天";
      if ($("dispAnnualTotal")) $("dispAnnualTotal").textContent = res.data.annual.total;
      if ($("dispAnnualUsed")) $("dispAnnualUsed").textContent = res.data.annual.used;

      if ($("dispCompLeft")) $("dispCompLeft").textContent = res.data.comp.left + " 時";
      if ($("dispCompTotal")) $("dispCompTotal").textContent = res.data.comp.total;
      if ($("dispCompUsed")) $("dispCompUsed").textContent = res.data.comp.used;
    }
  } catch (e) {
    console.error("儀表板錯誤", e);
  }
}

function getLocation(force) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      if (force) return reject(new Error("瀏覽器不支援定位"));
      return resolve({ lat: "", lng: "" });
    }
    const options = { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 };
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy || "" }),
      () => {
        if (!force) return resolve({ lat: "", lng: "", acc: "" });
        reject(new Error("定位失敗（請確認權限/訊號）"));
      },
      options
    );
  });
}

function showPanel(type) {
  ["panelClock", "panelOuting", "panelLeave", "panelOvertime"].forEach(id => {
    if ($(id)) $(id).style.display = "none";
  });
  if (type === "clock") { if ($("panelClock")) $("panelClock").style.display = "block"; if (locEl) locEl.textContent = "需定位"; }
  else if (type === "outing") { if ($("panelOuting")) $("panelOuting").style.display = "block"; if (locEl) locEl.textContent = "免定位（但外出打卡要定位）"; }
  else if (type === "leave") { if ($("panelLeave")) $("panelLeave").style.display = "block"; if (locEl) locEl.textContent = "免定位"; }
  else if (type === "overtime") { if ($("panelOvertime")) $("panelOvertime").style.display = "block"; if (locEl) locEl.textContent = "免定位"; }
}

// --- 自動扣除午休 1 小時 ---
window.calcLeaveHours = function () {
  const s = $("leaveStart").value;
  const e = $("leaveEnd").value;
  if (!s || !e) return;

  const start = new Date(s);
  const end = new Date(e);

  if (end <= start) {
    alert("結束時間不能早於開始時間");
    $("leaveEnd").value = "";
    return;
  }

  let hours = (end - start) / (36e5);
  if (hours > 4) hours = hours - 1;
  $("leaveTotalHours").textContent = hours.toFixed(1);
};

window.calcOtHours = function () {
  const d = $("otDate").value, s = $("otStart").value, e = $("otEnd").value;
  if (!d || !s || !e) return;
  const start = new Date(`${d}T${s}`), end = new Date(`${d}T${e}`);
  if (end <= start) { alert("結束錯誤"); $("otEnd").value = ""; return; }
  let h = (end - start) / (36e5);
  $("otTotalHours").textContent = (Math.floor(h * 2) / 2).toFixed(1);
};

window.calcOutingHours = function () {
  const s = $("outStart").value, e = $("outEnd").value;
  if (!s || !e) return;
  const today = new Date().toISOString().split('T')[0];
  const start = new Date(`${today}T${s}`), end = new Date(`${today}T${e}`);
  if (end <= start) { alert("結束錯誤"); $("outEnd").value = ""; return; }
  let h = (end - start) / (36e5);
  if (h > 4) h = h - 1;
  $("outTotalHours").textContent = h.toFixed(1);
};

async function submitRecord({ action, dataObj, requireGps }) {
  const { userId, displayName } = getUser();
  if (!userId) { location.href = "login.html"; return; }

  const buttons = document.querySelectorAll("button");
  buttons.forEach(b => b.disabled = true);
  setStatus("處理中...", true);

  try {
    let gps = { lat: "", lng: "", acc: "" };
    if (requireGps) {
      setStatus("📡 定位中...", true);
      gps = await getLocation(true);
    }

    setStatus("送出資料...", true);
    const payload = { action, userId, displayName, lat: gps.lat, lng: gps.lng, accuracy: gps.acc, data: dataObj };
    const res = await callApi(payload);

    if (res.ok) {
      setStatus(`✅ ${res.message}`, true);
      if (action === "clock_in" || action === "clock_out") alert(`打卡成功！${new Date().toTimeString().slice(0, 5)}`);
      if (action.includes("create")) {
        if ($("leaveReason")) $("leaveReason").value = "";
        if ($("otReason")) $("otReason").value = "";
        await loadDashboard();
        await loadApprovedOutings();
      }
    } else {
      setStatus(`❌ 失敗：${res.message}`, false);
    }
  } catch (err) {
    setStatus(`❌ 錯誤：${err.message}`, false);
  } finally {
    buttons.forEach(b => b.disabled = false);
  }
}

async function loadApprovedOutings() {
  const { userId } = getUser();
  if (!userId) return;
  try {
    const res = await callApi({ action: "get_my_outings", userId });
    const sel = $("approvedOutingSelect");
    if (!sel) return;

    sel.innerHTML = "";
    if (res.ok && res.list && res.list.length > 0) {
      res.list.forEach(item => {
        if (item.status !== "APPROVED") return;
        const opt = document.createElement("option");
        opt.value = item.requestId;
        opt.textContent = `${item.date} ${item.destination}（已核准）`;
        sel.appendChild(opt);
      });
      if (sel.children.length === 0) sel.innerHTML = "<option>無已核准外出單</option>";
    } else {
      sel.innerHTML = "<option>無已核准外出單</option>";
    }
  } catch (e) { }
}

function bindEvents() {
  if ($("actionType")) $("actionType").addEventListener("change", (e) => showPanel(e.target.value));
  if ($("btnClockIn")) $("btnClockIn").onclick = () => submitRecord({ action: "clock_in", requireGps: true, dataObj: {} });
  if ($("btnClockOut")) $("btnClockOut").onclick = () => submitRecord({ action: "clock_out", requireGps: true, dataObj: {} });

  // 外出申請
  if ($("btnOutApply")) $("btnOutApply").onclick = () => {
    if ($("outTotalHours").textContent === "0.0") return alert("請確認時間");
    const d = $("outDate").value;
    submitRecord({
      action: "create_outing", requireGps: false, dataObj: {
        start_full: `${d} ${$("outStart").value}`, end_full: `${d} ${$("outEnd").value}`,
        hours: $("outTotalHours").textContent, destination: $("outDest").value, reason: $("outReason").value
      }
    });
  };

  // 外出打卡（必須選已核准外出單，且要定位）
  const getOutReq = () => ({ requestId: $("approvedOutingSelect")?.value || "" });
  if ($("btnOutIn")) $("btnOutIn").onclick = () => {
    const rid = getOutReq().requestId;
    if (!rid || rid === "無已核准外出單") return alert("請先建立並核准外出單");
    submitRecord({ action: "outing_clock_in", requireGps: true, dataObj: { requestId: rid } });
  };
  if ($("btnOutOut")) $("btnOutOut").onclick = () => {
    const rid = getOutReq().requestId;
    if (!rid || rid === "無已核准外出單") return alert("請先建立並核准外出單");
    submitRecord({ action: "outing_clock_out", requireGps: true, dataObj: { requestId: rid } });
  };

  // 請假
  if ($("btnLeaveSubmit")) $("btnLeaveSubmit").onclick = () => {
    if ($("leaveTotalHours").textContent === "0.0") return alert("請確認時間");
    submitRecord({
      action: "create_leave", requireGps: false, dataObj: {
        type: $("leaveKind").value,
        start: $("leaveStart").value.replace("T", " "),
        end: $("leaveEnd").value.replace("T", " "),
        hours: $("leaveTotalHours").textContent,
        reason: $("leaveReason").value
      }
    });
  };

  // 加班
  if ($("btnOtSubmit")) $("btnOtSubmit").onclick = () => {
    if ($("otTotalHours").textContent === "0.0") return alert("請確認時間");
    const d = $("otDate").value;
    submitRecord({
      action: "create_ot", requireGps: false, dataObj: {
        start_full: `${d} ${$("otStart").value}`, end_full: `${d} ${$("otEnd").value}`,
        hours: $("otTotalHours").textContent, reason: $("otReason").value
      }
    });
  };
}

function init() {
  if (!ENDPOINT) return setStatus("❌ 未設定 GAS", false);
  const user = getUser();
  if (!user.userId) { location.href = "login.html"; return; }

  if (whoEl) whoEl.innerHTML = `${user.displayName} (${user.userId}) <a href="javascript:logout()" style="font-size:12px;color:#c22;margin-left:5px;">[登出]</a>`;

  // 主管按鈕是否顯示：改成由後端判斷（避免前端硬寫 M001）
  callApi({ action: "whoami", userId: user.userId }).then(r => {
    if (r.ok && r.isManager) {
      if ($("managerBtn")) $("managerBtn").style.display = "block";
    }
  }).catch(() => { });

  setStatus("就緒", true);
  if ($("actionType")) showPanel($("actionType").value);
  bindEvents();
  loadApprovedOutings();
  loadDashboard();
}
init();
function isManager_(){
  return localStorage.getItem("isManager") === "Y";
}
