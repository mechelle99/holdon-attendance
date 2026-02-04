/* app.js (Updated: Fetch API version) */
const ENDPOINT = window.CONFIG?.GAS_ENDPOINT || window.GAS_ENDPOINT;

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const whoEl = $("who");
const locEl = $("loc");

// --- 核心通訊函式 (取代原本的 jsonp) ---
async function callApi(payload) {
  if (!ENDPOINT) throw new Error("缺少 GAS_ENDPOINT");
  
  // 使用 fetch POST，這是跨網域最標準的做法
  const res = await fetch(ENDPOINT, {
    method: "POST",
    // 必須用 text/plain 以避免 Google 的 CORS 預檢 (preflight) 失敗
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch (e) {
    throw new Error("伺服器回傳格式錯誤: " + txt);
  }
}

function setStatus(msg, ok) {
  statusEl.innerHTML = msg;
  statusEl.className = "status " + (ok ? "ok" : "bad");
}

// --- 使用者與定位 ---
function getUser() {
  const userId = localStorage.getItem("employeeId");
  const displayName = localStorage.getItem("employeeName");
  return { userId, displayName };
}

function getLocation(force) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      if (force) return reject(new Error("瀏覽器不支援定位"));
      return resolve({ lat: "", lng: "" });
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => (force ? reject(err) : resolve({ lat: "", lng: "" })),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

// --- UI 切換 ---
function showPanel(type) {
  ["panelClock", "panelOuting", "panelLeave", "panelOvertime"].forEach(id => {
    $(id).style.display = "none";
  });

  if (type === "clock") {
    $("panelClock").style.display = "block";
    locEl.textContent = "需定位 (送出時抓取)";
  } else if (type === "outing") {
    $("panelOuting").style.display = "block";
    locEl.textContent = "外出申請免定位 / 外出打卡需定位";
  } else {
    // leave, overtime
    const map = { leave: "panelLeave", overtime: "panelOvertime" };
    $(map[type]).style.display = "block";
    locEl.textContent = "不需定位";
  }
}

// --- 統一送出函式 ---
async function submitRecord({ action, dataObj, requireGps }) {
  const { userId, displayName } = getUser();
  if (!userId) {
    setStatus("❌ 請先至 <a href='setup.html'>setup.html</a> 設定員工身份", false);
    return;
  }

  // 鎖定按鈕避免重複按
  const buttons = document.querySelectorAll("button");
  buttons.forEach(b => b.disabled = true);
  setStatus("送出中...", true);

  try {
    let gps = { lat: "", lng: "" };
    if (requireGps) {
      try {
        gps = await getLocation(true);
      } catch (e) {
        throw new Error("無法取得定位，請確認已授權 GPS。");
      }
    }

    whoEl.textContent = `${displayName} (${userId})`;
    if (requireGps) locEl.textContent = `${gps.lat}, ${gps.lng}`;

    // 呼叫後端
    const payload = {
      action: action, // 告訴後端要做什麼
      userId,
      displayName,
      lat: gps.lat,
      lng: gps.lng,
      data: dataObj
    };

    const res = await callApi(payload);

    if (res.ok) {
      setStatus(`✅ 成功：${res.message || "已送出"}`, true);
      // 如果是外出申請成功，重新整理清單
      if (action === "create_outing") await loadApprovedOutings();
    } else {
      setStatus(`❌ 失敗：${res.message || "未知錯誤"}`, false);
    }

  } catch (err) {
    setStatus(`❌ 錯誤：${err.message}`, false);
  } finally {
    buttons.forEach(b => b.disabled = false);
  }
}

// --- 功能綁定 ---
async function loadApprovedOutings() {
  const { userId } = getUser();
  if(!userId) return;
  
  try {
    const res = await callApi({ action: "get_my_outings", userId });
    const sel = $("approvedOutingSelect");
    sel.innerHTML = "";
    
    if (res.ok && res.list && res.list.length > 0) {
      res.list.forEach(item => {
        const opt = document.createElement("option");
        opt.value = item.requestId;
        opt.textContent = `${item.date} ${item.destination} (${item.status})`;
        sel.appendChild(opt);
      });
    } else {
      sel.innerHTML = "<option>無已核准的外出單</option>";
    }
  } catch(e) { console.error(e); }
}


// --- 修改：自動計算請假時數 (增加防呆) ---
// --- 新增：自動計算外出時數 (含防呆) ---
window.calcOutingHours = function() {
  const dateVal = $("outDate").value;
  const startVal = $("outStart").value;
  const endVal = $("outEnd").value;
  
  if (!startVal || !endVal) return;
  
  // 如果還沒選日期，先用今天代替來算時數差，但送出時會檢查日期
  const baseDate = dateVal || new Date().toISOString().split('T')[0];
  
  const start = new Date(`${baseDate}T${startVal}`);
  const end = new Date(`${baseDate}T${endVal}`);
  
  // 防呆：結束時間早於開始時間
  if (end <= start) {
    alert("❌ 結束時間不能早於開始時間！");
    $("outEnd").value = ""; // 清空錯誤的時間
    $("outTotalHours").textContent = "0.0";
    return;
  }
  
  const diffMs = end - start;
  let hours = diffMs / (1000 * 60 * 60);
  
  // 外出通常算到小數點第一位即可
  $("outTotalHours").textContent = hours.toFixed(1);
}

// --- 修改：自動計算加班時數 (增加防呆) ---
window.calcOtHours = function() {
  const dateVal = $("otDate").value;
  const startVal = $("otStart").value;
  const endVal = $("otEnd").value;
  
  if (!startVal || !endVal) return;
  if (!dateVal) {
    // 如果還沒選日期，暫時不報錯，但無法完整計算
    return;
  }

  // 組合出完整的時間物件來比較
  const start = new Date(`${dateVal}T${startVal}`);
  const end = new Date(`${dateVal}T${endVal}`);
  
  // 處理跨日加班 (例如 23:00 到 01:00) 
  // 如果結束時間比開始時間小，通常代表跨日，但如果你不允許跨日加班，可以用下面的邏輯擋住：
  if (end <= start) {
    alert("❌ 加班結束時間不能早於開始時間 (若跨日請分兩張單填寫)");
    $("otEnd").value = "";
    $("otTotalHours").textContent = "0.0";
    return;
  }
  
  let diffMs = end - start;
  let hours = diffMs / (1000 * 60 * 60);
  // 加班以 0.5 小時為單位 (無條件捨去到小數點第一位)
  // 例如 1.8 -> 1.5, 1.2 -> 1.0
  hours = Math.floor(hours * 2) / 2; 

  $("otTotalHours").textContent = hours.toFixed(1);
}

// --- 修改：送出邏輯 (整理資料格式) ---
// 修改：外出申請送出
  $("btnOutApply").onclick = () => {
    // 檢查必填
    if($("outTotalHours").textContent === "0.0") return alert("請確認時間與時數");
    if(!$("outDate").value) return alert("請選擇日期");
    if(!$("outDest").value) return alert("請填寫目的地");
    if(!$("outReason").value) return alert("請填寫原因");

    const date = $("outDate").value;

    submitRecord({
      action: "create_outing", 
      requireGps: false,
      dataObj: {
        // 組合完整時間字串，讓後端好寫入 Sheet
        start_full: `${date} ${$("outStart").value}`, 
        end_full: `${date} ${$("outEnd").value}`,
        hours: $("outTotalHours").textContent,
        destination: $("outDest").value,
        reason: $("outReason").value
      }
    });
  };

  // 1. 上下班打卡
  const handleClock = (action) => {
    submitRecord({ action, requireGps: true, dataObj: {} }).then(() => {
        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0');
        alert(`打卡成功！時間：${timeStr}`);
    });
  };
  $("btnClockIn").onclick = () => handleClock("clock_in");
  $("btnClockOut").onclick = () => handleClock("clock_out");

  // ... (外出部分維持不變) ...

  // 4. 請假送出
  $("btnLeaveSubmit").onclick = () => {
    if($("leaveTotalHours").textContent === "0.0") return alert("請確認時間與時數");
    
    submitRecord({
      action: "create_leave", requireGps: false,
      dataObj: {
        type: $("leaveKind").value, // 假別
        start: $("leaveStart").value.replace("T", " "), // 轉成好讀格式
        end: $("leaveEnd").value.replace("T", " "),
        hours: $("leaveTotalHours").textContent,
        reason: $("leaveReason").value
      }
    });
  };

  // 5. 加班送出
  $("btnOtSubmit").onclick = () => {
    if($("otTotalHours").textContent === "0.0") return alert("請確認時間與時數");

    const date = $("otDate").value;
    const start = $("otStart").value;
    const end = $("otEnd").value;

    submitRecord({
      action: "create_ot", requireGps: false,
      dataObj: {
        // 組合完整的字串給後端，這樣 Sheet 才會整齊
        start_full: `${date} ${start}`, 
        end_full: `${date} ${end}`,
        hours: $("otTotalHours").textContent,
        reason: $("otReason").value
      }
    });
  };
}
  // 1. 上下班打卡 (增加顯示時間)
  const handleClock = (action) => {
    submitRecord({ action, requireGps: true, dataObj: {} }).then(() => {
        // 需求3：打卡後顯示時間
        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0');
        alert(`打卡成功！時間：${timeStr}`);
    });
  };
  $("btnClockIn").onclick = () => handleClock("clock_in");
  $("btnClockOut").onclick = () => handleClock("clock_out");

  // ... (外出部分維持不變) ...

  // 4. 請假 (改抓新的欄位)
  $("btnLeaveSubmit").onclick = () => {
    submitRecord({
      action: "create_leave", requireGps: false,
      dataObj: {
        type: $("leaveKind").value,
        start: $("leaveStart").value,
        end: $("leaveEnd").value,
        hours: $("leaveTotalHours").textContent, // 傳送計算後的時數
        reason: $("leaveReason").value
      }
    });
  };

  // 5. 加班 (改抓新的欄位)
  $("btnOtSubmit").onclick = () => {
    submitRecord({
      action: "create_ot", requireGps: false,
      dataObj: {
        date: $("otDate").value,
        start: $("otStart").value, // 傳送開始時間
        end: $("otEnd").value,     // 傳送結束時間
        hours: $("otTotalHours").textContent, // 傳送計算後的時數
        reason: $("otReason").value
      }
    });
  };
  
  // ... (其他事件綁定) ...
}

// 初始化
function init() {
  if (!ENDPOINT) return setStatus("❌ 未設定 GAS_ENDPOINT", false);
  const user = getUser();
  if (!user.userId) {
    setStatus("⚠️ 請先執行 <a href='setup.html'>setup.html</a> 設定身份", false);
  } else {
    whoEl.textContent = `${user.displayName} (${user.userId})`;
    setStatus("✅ 系統就緒", true);
  }
  
  showPanel($("actionType").value);
  bindEvents();
  loadApprovedOutings();
}

init();
