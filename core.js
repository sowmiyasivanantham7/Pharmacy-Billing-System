/* PharmaSense – shared helpers. Everything hangs off the global `App`. */
const App = { user: null, pages: {}, cart: [], PHARMACY: { name: "PharmaSense Pharmacy", addr: "12, Market Road, Saint Thomas Mount, Chennai", gstin: "33ABCDE1234F1Z5", dl: "DL No. TN-CH/20-1234" } };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = n => Number(n || 0).toLocaleString("en-IN");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = iso => { if (!iso) return "–"; const [y, m, d] = iso.split("-"); return `${+d} ${MONTHS[+m - 1]} ${y}`; };
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const slug = s => String(s).toLowerCase().replace(/[^a-z]+/g, "-");

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch("/api" + path, {
    method, credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (_) { /* non-JSON error page */ }
  if (res.status === 401 && !path.startsWith("/auth/login")) {
    if (App.user) { App.user = null; App.showLogin("Your session expired. Please sign in again."); }
    throw Object.assign(new Error("Session expired"), { status: 401 });
  }
  if (!res.ok) throw Object.assign(new Error(data.error || "Request failed (" + res.status + ")"), { status: res.status, data });
  return data;
}

function toast(msg, kind = "") {
  const t = document.createElement("div");
  t.className = "toast " + kind; t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), kind === "bad" ? 6000 : 3200);
}

/* ---------- modal ---------- */
function modal({ title, body, foot = "", wide = false, onMount }) {
  closeModal();
  const root = $("#modal-root");
  root.innerHTML = `<div class="backdrop" data-act="backdrop">
    <div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="btn ghost icon" data-act="close-modal" aria-label="Close">✕</button></div>
      <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot no-print">${foot}</div>` : ""}
    </div></div>`;
  const el = $(".modal", root);
  const first = $("input,select,textarea", el); if (first) first.focus();
  if (onMount) onMount(el);
  return el;
}
function closeModal() { $("#modal-root").innerHTML = ""; }
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

function confirmBox(title, message, okLabel = "Confirm", danger = false) {
  return new Promise(resolve => {
    modal({ title, body: `<p style="margin:0">${message}</p>`,
      foot: `<button class="btn" data-act="cb-no">Cancel</button><button class="btn ${danger ? "danger" : "primary"}" data-act="cb-yes">${esc(okLabel)}</button>` });
    App._cb = resolve;
  });
}

/* ---------- small UI builders ---------- */
const riskBadge = r => `<span class="badge b-${slug(r)}">${esc(r)}</span>`;
const stockBadge = s => `<span class="badge ${s === "OK" ? "b-ok" : s === "Low" ? "b-low-stock" : "b-out"}">${esc(s)}</span>`;
const rxBadge = () => `<span class="badge b-rx" title="Prescription required">Rx</span>`;
const emptyRow = (cols, msg = "Nothing to show") => `<tr><td colspan="${cols}" class="empty">${msg}</td></tr>`;

function barChart(series) {
  const max = Math.max(...series.map(s => s.total), 1);
  const last = series.length - 1;
  return `<div class="bars" role="img" aria-label="Sales for the last 14 days">${series.map((s, i) => {
    const h = Math.round((s.total / max) * 100);
    const d = new Date(s.date + "T00:00:00");
    return `<div class="col" title="${fmtDate(s.date)}: ${inr(s.total)}"><span class="val">${s.total ? Math.round(s.total) : ""}</span><div class="bar ${i === last ? "today" : ""}" style="height:${h}%"></div><span class="lbl">${d.getDate()}</span></div>`;
  }).join("")}</div>`;
}

function hbars(rows, unit = "") {
  const max = Math.max(...rows.map(r => r.value), 1);
  return rows.map(r => `<div class="hbar"><span title="${esc(r.label)}" class="nowrap" style="overflow:hidden;text-overflow:ellipsis">${esc(r.label)}</span><div class="track"><div class="fill" style="width:${(r.value / max) * 100}%"></div></div><b class="right">${num(r.value)}${unit}</b></div>`).join("");
}

function daysLabel(d) {
  if (d < 0) return `expired ${-d}d ago`;
  if (d === 0) return "expires today";
  return d >= 60 ? `${Math.round(d / 30)} mo left` : `${d}d left`;
}

/* ---------- global click delegation ---------- */
App.actions = {
  "close-modal": () => closeModal(),
  backdrop: (_, e) => { if (e.target.classList.contains("backdrop")) closeModal(); },
  "cb-yes": () => { closeModal(); App._cb && App._cb(true); },
  "cb-no": () => { closeModal(); App._cb && App._cb(false); },
  "toggle-menu": () => $("#sidebar").classList.toggle("open"),
  print: () => window.print(),
};
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const fn = App.actions[el.dataset.act];
  if (fn) { if (el.tagName === "A") e.preventDefault(); fn(el, e); }
});
