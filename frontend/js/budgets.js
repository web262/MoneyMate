import { api } from "./api.js";
const $ = (s, r=document)=>r.querySelector(s);

let toast, modal;

window.addEventListener("DOMContentLoaded", async ()=>{
  const me = await api("/auth/me").catch(()=>({success:false}));
  if (!me.success || !me.data){ location.href = "login.html"; return; }

  toast = new bootstrap.Toast($("#toast"), { delay: 2200 });
  modal = new bootstrap.Modal($("#budgetModal"));

  $("#logout").addEventListener("click", async ()=>{
    await api("/auth/logout", "POST").catch(()=>{});
    location.href = "index.html";
  });

  $("#budgetForm").addEventListener("submit", submitBudget);

  await refresh();
});

async function refresh(){
  await Promise.all([loadProgress(), loadAlerts()]);
}

async function loadProgress(){
  const r = await api("/budgets/progress");
  const grid = $("#budgetGrid"); grid.innerHTML = "";
  if (!r.progress || r.progress.length === 0){
    grid.innerHTML = `<div class="muted">No budgets yet. Click “New Budget” to add your first one.</div>`;
    return;
  }
  r.progress.forEach(b=>{
    const pct = Math.min(1, b.pct || 0);
    const color = pct >= 1 ? "bg-bad" : (pct >= .8 ? "bg-warn" : "bg-ok");
    const col = document.createElement("div");
    col.className = "col-md-6";
    col.innerHTML = `
      <div class="card-budget h-100">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <div class="title">${b.category}</div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-light" data-edit="${b.id}" data-category="${b.category}" data-limit="${b.monthly_limit}">
              <i class="fa-regular fa-pen-to-square"></i>
            </button>
            <button class="btn btn-outline-danger" data-del="${b.id}">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>
        <div class="small muted mb-1">$${b.spent_mtd.toFixed(0)} / $${b.monthly_limit.toFixed(0)}</div>
        <div class="progress"><div class="progress-bar ${color}" style="width:${pct*100}%"></div></div>
      </div>
    `;
    grid.appendChild(col);
  });

  // wire actions
  grid.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const form = $("#budgetForm");
      form.reset();
      form.querySelector(".modal-title").textContent = "Edit Budget";
      // set the HIDDEN INPUT named "id" (not form.id)
      form.querySelector('[name="id"]').value = btn.dataset.edit;
      form.querySelector('[name="category"]').value = btn.dataset.category;
      form.querySelector('[name="monthly_limit"]').value = btn.dataset.limit;
      modal.show();
    });
  });
  grid.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      if (!confirm("Delete this budget?")) return;
      try { await api(`/budgets/${btn.dataset.del}`, "DELETE"); toastMsg("Budget deleted"); await refresh(); }
      catch (e){ toastMsg(e.message); }
    });
  });
}

async function loadAlerts(){
  const r = await api("/budgets/alerts");
  const box = $("#alertsBox"); box.innerHTML = "";
  if (!r.alerts || r.alerts.length === 0){
    box.innerHTML = `<span class="muted">No alerts right now.</span>`;
    return;
  }
  r.alerts.forEach(a=>{
    const div = document.createElement("div");
    div.className = "mb-1";
    div.textContent = "• " + a.message;
    box.appendChild(div);
  });
}

async function submitBudget(e){
  e.preventDefault();
  // Grab the real form element explicitly (avoids currentTarget null after await)
  const formEl = $("#budgetForm");
  const fd = new FormData(formEl);

  const payload = Object.fromEntries(fd.entries());
  // normalize category casing to match backend capitalization
  payload.category = (payload.category || "").trim();
  payload.monthly_limit = Number(payload.monthly_limit);

  try{
    await api("/budgets", "POST", payload);   // upsert by category
    formEl.reset();                           // <-- safe now
    modal.hide();
    toastMsg("Budget saved");
    await refresh();
  }catch(err){
    toastMsg(err.message);
  }
}

function toastMsg(m){ $("#toastMsg").textContent = m; toast.show(); }
