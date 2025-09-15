import { api } from "./api.js";

const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const fmt = d => d.toISOString().split("T")[0];

let toast, txModal;
let page = 1, perPage = 12;
let cache = []; // filtered from API for current date range
let settings = { currency_symbol: "$" };

// ---- settings helpers (currency etc.) ----
async function getSettings(){
  try{
    const cached = sessionStorage.getItem("mm_settings");
    if (cached) return JSON.parse(cached);
    const res = await api("/settings","GET");
    sessionStorage.setItem("mm_settings", JSON.stringify(res.settings));
    return res.settings;
  }catch{ return { currency_symbol:"$", warn_threshold:0.8, critical_threshold:1.0 }; }
}
function money(n, sym="$"){ return `${sym}${Number(n||0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`; }

window.addEventListener("DOMContentLoaded", async () => {
  const me = await api("/auth/me").catch(()=>({success:false}));
  if (!me.success || !me.data) { location.href = "login.html"; return; }

  settings = await getSettings();

  toast = new bootstrap.Toast($("#toast"), { delay: 2200 });
  txModal = new bootstrap.Modal($("#txModal"));

  // default date range = this month
  const now = new Date();
  $("#filterStart").value = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
  $("#filterEnd").value = fmt(now);

  setupEvents();
  await refresh();
});

function setupEvents(){
  $("#logout").addEventListener("click", async () => {
    await api("/auth/logout","POST").catch(()=>{});
    location.href = "index.html";
  });

  ["change","input"].forEach(ev=>{
    $("#filterType").addEventListener(ev, applyFilters);
    $("#filterCategory").addEventListener(ev, applyFilters);
    $("#filterStart").addEventListener(ev, applyFilters);
    $("#filterEnd").addEventListener(ev, applyFilters);
  });

  $("#btnReset").addEventListener("click", async ()=>{
    $("#filterType").value = "all";
    $("#filterCategory").value = "all";
    const now = new Date();
    $("#filterStart").value = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
    $("#filterEnd").value = fmt(now);
    await refresh();
  });

  $("#prevPage").addEventListener("click", ()=> { if (page>1){ page--; renderTable(); }});
  $("#nextPage").addEventListener("click", ()=> { if (page*perPage<cache.length){ page++; renderTable(); }});

  // Add/Edit submit
  $("#txForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const form = $("#txForm");
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.amount = Number(payload.amount);
    if (payload.created_at === "") delete payload.created_at;

    try {
      if (payload.id) {
        const id = Number(payload.id);
        delete payload.id;
        await api(`/transactions/${id}`, "PATCH", payload);
        toastMsg("Transaction updated");
      } else {
        await api("/transactions", "POST", payload);
        toastMsg("Transaction added");
      }
      txModal.hide();
      form.reset();
      await refresh();
    } catch (err) {
      toastMsg(err.message || "Save failed");
    }
  });

  // ---- Import/Export/UI helpers ----
  // Export CSV for current date range
  $("#btnExport").addEventListener("click", ()=>{
    const start = $("#filterStart").value || "";
    const end   = $("#filterEnd").value || "";
    const url = `/api/transactions/export?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`;
    window.location.href = url; // triggers download
  });

  // Import CSV
  $("#fileImport").addEventListener("change", async (e)=>{
    const file = e.target.files[0];
    if (!file) return;
    try{
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/transactions/import", {
        method: "POST",
        credentials: "include",
        body: fd
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.message || `Import failed (${res.status})`);
      toastMsg(`Imported: ${j.created}, Skipped: ${j.skipped}`);
      await refresh();
    }catch(err){
      toastMsg(err.message || "Import failed");
    }finally{
      e.target.value = ""; // reset file input
    }
  });

  // Download template CSV
  $("#btnTemplate").addEventListener("click", ()=>{
    const csv = "date,type,amount,category,description\n" +
                "2025-08-01 09:30,expense,12.50,Transport,Uber ride\n" +
                "2025-08-02 18:00,expense,45.20,Groceries,Whole Foods\n" +
                "2025-08-03 09:00,income,2500,Salary,August paycheck\n";
    const blob = new Blob([csv], {type: "text/csv;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "moneymate_transactions_template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

async function refresh(){
  const start = $("#filterStart").value;
  const end   = $("#filterEnd").value;

  const res = await api(`/transactions/all?start_date=${start}&end_date=${end}&page_size=5000`);
  cache = res.transactions || [];

  // build categories for filter
  const cats = Array.from(new Set(cache.map(t=>t.category).filter(Boolean))).sort();
  const sel = $("#filterCategory");
  const cur = sel.value;
  sel.innerHTML = `<option value="all">All</option>` + cats.map(c=>`<option>${c}</option>`).join("");
  if ([...sel.options].some(o=>o.value===cur)) sel.value = cur;

  page = 1;
  applyFilters();
}

function applyFilters(){
  const type = $("#filterType").value;
  const cat  = $("#filterCategory").value;

  let list = cache.slice();
  if (type !== "all") list = list.filter(t => t.type === type);
  if (cat  !== "all") list = list.filter(t => (t.category||"") === cat);

  // newest first
  list.sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));

  $("#txBody").dataset.filtered = JSON.stringify(list);
  page = 1;
  renderTable();
}

function renderTable(){
  const filtered = JSON.parse($("#txBody").dataset.filtered || "[]");
  const startIdx = (page-1)*perPage;
  const slice = filtered.slice(startIdx, startIdx+perPage);

  const tbody = $("#txBody"); tbody.innerHTML = "";
  slice.forEach(t=>{
    const tr = document.createElement("tr");
    const sign = t.type === "expense" ? "-" : "+";
    tr.innerHTML = `
      <td>${(t.created_at||"").replace("T"," ").slice(0,16)}</td>
      <td>${escapeHtml(t.description||"")}</td>
      <td>${escapeHtml(t.category||"")}</td>
      <td><span class="badge ${t.type==='expense'?'badge-expense':'badge-income'}">${t.type}</span></td>
      <td class="text-end">${sign}${money(t.amount, settings.currency_symbol)}</td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-light" data-act="edit" data-id="${t.id}"><i class="fa-regular fa-pen-to-square"></i></button>
          <button class="btn btn-outline-danger" data-act="del" data-id="${t.id}"><i class="fa-regular fa-trash-can"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  $("#summaryLabel").textContent = `${filtered.length} item${filtered.length!==1?'s':''}`;
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  $("#pageInfo").textContent = `${page} / ${pages}`;
  $("#prevPage").disabled = page<=1;
  $("#nextPage").disabled = page>=pages;

  // wire actions
  tbody.querySelectorAll("[data-act='edit']").forEach(btn=>{
    btn.addEventListener("click", ()=> openEdit(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll("[data-act='del']").forEach(btn=>{
    btn.addEventListener("click", ()=> doDelete(Number(btn.dataset.id)));
  });
}

async function openEdit(id){
  const filtered = JSON.parse($("#txBody").dataset.filtered || "[]");
  const tx = filtered.find(x=>x.id===id);
  if (!tx) return;
  const form = $("#txForm");
  form.reset();
  form.querySelector("[name='id']").value = tx.id;
  form.querySelector("[name='type']").value = tx.type;
  form.querySelector("[name='amount']").value = tx.amount;
  form.querySelector("[name='description']").value = tx.description || "";
  form.querySelector("[name='category']").value = tx.category || "";
  if (tx.created_at) form.querySelector("[name='created_at']").value = tx.created_at.slice(0,16);
  form.querySelector(".modal-title").textContent = "Edit Transaction";
  txModal.show();
}

async function doDelete(id){
  if (!confirm("Delete this transaction?")) return;
  try {
    await api(`/transactions/${id}`, "DELETE");
    toastMsg("Transaction deleted");
    await refresh();
  } catch (err) {
    toastMsg(err.message || "Delete failed");
  }
}

function toastMsg(m){ $("#toastMsg").textContent = m; toast.show(); }
function escapeHtml(s){ return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
