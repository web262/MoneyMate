import { api, getJSON, postJSON, delJSON, clearToken } from "./api.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const fmt = (d) => d.toISOString().split("T")[0];

let period = "weekly"; // weekly | monthly | custom
let start = null;
let end = null;

let toast, txModal, goalModal, contribModal, contribForm;

window.addEventListener("DOMContentLoaded", async () => {
  // Session check (api.js throws on 401)
  try {
    await getJSON("/auth/me/");
  } catch {
    location.replace("login.html?next=dashboard.html");
    return;
  }

  toast = new bootstrap.Toast($("#toast"), { delay: 2500 });
  txModal = new bootstrap.Modal($("#txModal"));
  goalModal = new bootstrap.Modal($("#goalModal"));
  contribModal = new bootstrap.Modal($("#contribModal"));

  setupPeriodControls();
  setupForms();

  computeDefaultRange();
  await refreshAll();
});

// ---------- Period controls ----------
function setupPeriodControls() {
  $$(".btn-group [data-period]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      $$(".btn-group [data-period]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      period = btn.dataset.period;

      const fields = [$("#startDate"), $("#endDate"), $("#toLabel")];
      if (period === "custom") fields.forEach((el) => el.classList.remove("d-none"));
      else fields.forEach((el) => el.classList.add("d-none"));

      computeDefaultRange();
      await refreshAll();
    });
  });

  $("#startDate")?.addEventListener("change", async () => {
    start = new Date($("#startDate").value);
    await refreshAll();
  });

  $("#endDate")?.addEventListener("change", async () => {
    end = new Date($("#endDate").value);
    await refreshAll();
  });
}

function computeDefaultRange() {
  const now = new Date();
  if (period === "weekly") {
    end = now;
    start = new Date(now);
    start.setDate(now.getDate() - 6);
  } else if (period === "monthly") {
    end = now;
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    start = $("#startDate").value ? new Date($("#startDate").value) : new Date(now.getFullYear(), now.getMonth(), 1);
    end = $("#endDate").value ? new Date($("#endDate").value) : now;
    $("#startDate").value = fmt(start);
    $("#endDate").value = fmt(end);
  }
  $("#dateRange").textContent = `${fmt(start)} → ${fmt(end)}`;
}

// ---------- Forms ----------
function setupForms() {
  // Add transaction
  $("#txForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    if (payload.created_at === "") delete payload.created_at;
    payload.amount = Number(payload.amount);
    try {
      await postJSON("/transactions/", payload);
      txModal.hide();
      toastMsg("Transaction added");
      await refreshAll();
    } catch (err) {
      toastMsg(err.message || "Failed to add transaction");
    }
  });

  // Add goal
  $("#goalForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    payload.target_amount = Number(payload.target_amount);
    try {
      await postJSON("/goals/", payload);
      goalModal.hide();
      e.currentTarget.reset();
      toastMsg("Goal created");
      await loadGoals();
    } catch (err) {
      toastMsg(err.message || "Failed to create goal");
    }
  });

  // Contribute to goal
  contribForm = $("#contribForm");
  contribForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(contribForm);
    const payload = Object.fromEntries(fd.entries());
    payload.amount = Number(payload.amount);
    payload.goal_id = Number(payload.goal_id);
    try {
      await postJSON("/goals/contribute/", payload);
      contribModal.hide();
      contribForm.reset();
      toastMsg("Contribution added");
      await loadGoals();
    } catch (err) {
      toastMsg(err.message || "Failed to add contribution");
    }
  });

  // logout
  $("#logout")?.addEventListener("click", async () => {
    try { await postJSON("/auth/logout/", {}); } catch (_) {}
    clearToken();
    location.replace("login.html?next=dashboard.html");
  });
}

function toastMsg(msg) {
  $("#toastMsg").textContent = msg;
  toast?.show();
}

// ---------- Loaders ----------
async function refreshAll() {
  await Promise.all([
    loadTransactionsAndCharts(),
    loadInsights(),
    loadBudgetProgress(),
    loadAlerts(),
    loadGoals(),
    loadRecentTx(),
  ]);
}

async function loadTransactionsAndCharts() {
  const res = await getJSON(`/transactions/all/?start_date=${fmt(start)}&end_date=${fmt(end)}&page_size=2000`);
  const txns = (res.transactions || []).reverse();

  // cards
  const inc = txns.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const exp = txns.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  $("#sumIncome").textContent = `$${inc.toLocaleString()}`;
  $("#sumExpense").textContent = `$${exp.toLocaleString()}`;
  $("#sumNet").textContent = `$${(inc - exp).toLocaleString()}`;

  // day map
  const dayMap = {};
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dayMap[fmt(d)] = { income: 0, expense: 0 };
  }
  txns.forEach((t) => {
    const d = (t.created_at || "").slice(0, 10);
    if (dayMap[d]) dayMap[d][t.type] += Number(t.amount);
  });

  const labels = Object.keys(dayMap);
  const dataIncome = labels.map((d) => dayMap[d].income);
  const dataExpense = labels.map((d) => dayMap[d].expense);
  renderLine(labels, dataIncome, dataExpense);

  // MTD category doughnut
  const monthStart = new Date(end.getFullYear(), end.getMonth(), 1);
  const mtd = txns.filter((t) => new Date(t.created_at) >= monthStart && t.type === "expense");
  const catMap = {};
  mtd.forEach((t) => {
    const k = t.category || "Uncategorized";
    catMap[k] = (catMap[k] || 0) + Number(t.amount);
  });
  renderDoughnut(Object.keys(catMap), Object.values(catMap));
}

let lineChart, doughnutChart;
function renderLine(labels, inc, exp) {
  lineChart?.destroy();
  lineChart = new Chart($("#incomeExpenseChart").getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Income", data: inc, fill: true, tension: 0.3 },
        { label: "Expenses", data: exp, fill: true, tension: 0.3 },
      ],
    },
    options: { responsive: true, scales: { y: { beginAtZero: true } } },
  });
}
function renderDoughnut(labels, data) {
  doughnutChart?.destroy();
  doughnutChart = new Chart($("#budgetChart").getContext("2d"), {
    type: "doughnut",
    data: { labels, datasets: [{ data }] },
    options: { plugins: { legend: { position: "bottom" } } },
  });
}

async function loadBudgetProgress() {
  const r = await getJSON("/budgets/progress/");
  const box = $("#budgetProgress");
  box.innerHTML = "";
  if (!r.progress || r.progress.length === 0) {
    box.innerHTML = `<div class="muted">No budgets set yet. Create them in the Budgets page.</div>`;
    return;
  }
  r.progress.forEach((p) => {
    const pct = Math.min(1, p.pct || 0);
    const color = pct >= 1 ? "bg-danger" : pct >= 0.8 ? "bg-warning" : "bg-success";
    const wrap = document.createElement("div");
    wrap.className = "mb-2";
    wrap.innerHTML = `
      <div class="d-flex justify-content-between small">
        <span>${p.category}</span>
        <span>$${p.spent_mtd.toFixed(0)} / $${p.monthly_limit.toFixed(0)}</span>
      </div>
      <div class="progress"><div class="progress-bar ${color}" style="width:${pct * 100}%"></div></div>
    `;
    box.appendChild(wrap);
  });
}

async function loadAlerts() {
  const r = await getJSON("/budgets/alerts/");
  const menu = $("#notifMenu");
  const badge = $("#notifBadge");
  const alerts = r.alerts || [];
  menu.innerHTML = "";
  if (alerts.length === 0) {
    menu.innerHTML = `<div class="muted small px-2">No notifications</div>`;
    badge.classList.add("d-none");
  } else {
    alerts.forEach((a) => {
      const item = document.createElement("div");
      item.className = "dropdown-item text-wrap";
      item.textContent = a.message;
      menu.appendChild(item);
    });
    badge.textContent = alerts.length;
    badge.classList.remove("d-none");
  }
}

async function loadInsights() {
  const r = await getJSON("/insights/");
  const box = $("#insights-container");
  box.innerHTML = "";
  (r.advice || []).forEach((a) => {
    const div = document.createElement("div");
    div.className = "mb-2";
    div.innerHTML = `<div class="fw-semibold">${a.title}</div><div class="muted">${a.text}</div>`;
    box.appendChild(div);
  });
}

async function loadRecentTx() {
  const r = await getJSON(`/transactions/all/?start_date=${fmt(start)}&end_date=${fmt(end)}&page_size=10`);
  const tbody = $("#recentTx");
  tbody.innerHTML = "";
  (r.transactions || []).forEach((t) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${(t.created_at || "").replace("T", " ").slice(0, 16)}</td>
      <td>${t.type}</td>
      <td>${t.category || ""}</td>
      <td>${t.description || ""}</td>
      <td class="text-end">${t.type === "expense" ? "-" : "+"}$${Number(t.amount).toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadGoals() {
  const r = await getJSON("/goals/");
  const box = $("#goalsList");
  box.innerHTML = "";
  if (!r.goals || r.goals.length === 0) {
    box.innerHTML = `<div class="muted">No goals yet. Add one using the + button.</div>`;
    return;
  }
  r.goals.forEach((g) => {
    const pct = Math.min(1, g.progress_pct || 0);
    const wrap = document.createElement("div");
    wrap.className = "mb-3";
    wrap.innerHTML = `
      <div class="d-flex justify-content-between small">
        <div class="fw-semibold">${g.name}</div>
        <div>$${g.current_amount.toFixed(0)} / $${g.target_amount.toFixed(0)}</div>
      </div>
      <div class="progress mb-2"><div class="progress-bar ${pct >= 1 ? "bg-success" : ""}" style="width:${pct * 100}%"></div></div>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-light btn-sm" data-action="contrib" data-id="${g.id}">Contribute</button>
        <button class="btn btn-outline-danger btn-sm" data-action="delete" data-id="${g.id}">Delete</button>
      </div>
    `;
    box.appendChild(wrap);
  });

  box.querySelectorAll("[data-action='contrib']").forEach((btn) => {
    btn.addEventListener("click", () => {
      contribForm.goal_id.value = btn.dataset.id;
      contribModal.show();
    });
  });
  box.querySelectorAll("[data-action='delete']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this goal?")) return;
      await delJSON(`/goals/${btn.dataset.id}/`);
      toastMsg("Goal deleted");
      await loadGoals();
    });
  });
}

// ---- Optional: browser notifications ----
async function notifyNow(sendEmail = false) {
  try {
    // new preview endpoint
    const res = await getJSON("/notifications/preview");
    const items = res?.alerts || [];
    if (!items.length) return;

    // native notifications (optional)
    if ("Notification" in window) {
      if (Notification.permission === "default") {
        await Notification.requestPermission();
      }
      if (Notification.permission === "granted") {
        items.slice(0, 3).forEach((msg) =>
          new Notification("MoneyMate", { body: msg })
        );
      }
    }

    // email digest (optional)
    if (sendEmail) {
      await postJSON("/notifications/send", {}); // new send endpoint
    }
  } catch (e) {
    // don't spam the console or break the page if notifications are blocked
    console.debug("notify skipped:", e?.message || e);
  }
}
notifyNow(false);
document.getElementById("notifBell")?.addEventListener("click", () =>
  notifyNow(true)
);
