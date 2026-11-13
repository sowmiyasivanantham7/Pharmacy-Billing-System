/* Router, login/logout, navigation */
const NAV = [
  { sec: "Pharmacy" },
  { id: "dashboard", label: "Dashboard", ico: "▦", title: "Dashboard" },
  { id: "billing", label: "New Bill", ico: "＋", title: "New Bill – Smart FEFO" },
  { id: "sales", label: "Sales History", ico: "☰", title: "Sales History & Invoices" },
  { id: "medicines", label: "Medicines", ico: "✚", title: "Medicines & Batches" },
  { id: "refills", label: "Refills", ico: "☎", title: "Refill Reminders", pill: "refills" },
  { id: "interactions", label: "Interaction Rules", ico: "⚠", title: "Drug Interaction Rules" },
  { sec: "Admin", admin: true },
  { id: "inventory", label: "Inventory Analysis", ico: "◔", title: "Inventory Analysis", admin: true },
  { id: "reorder", label: "Reorder List", ico: "⇪", title: "Reorder List", admin: true },
  { id: "rxregister", label: "Rx Register", ico: "℞", title: "Prescription Register", admin: true },
  { id: "employees", label: "Employees", ico: "☺", title: "Employee Management", admin: true },
  { id: "audit", label: "Audit Log", ico: "⌕", title: "Audit Log", admin: true },
];
const allowed = () => NAV.filter(n => n.id && (!n.admin || App.user.role === "admin"));

function buildNav() {
  $("#nav").innerHTML = NAV.filter(n => !n.admin || App.user.role === "admin").map(n => n.sec
    ? `<div class="sec">${n.sec}</div>`
    : `<a href="#/${n.id}" data-page="${n.id}"><span class="ico">${n.ico}</span>${n.label}${n.pill ? `<span class="pill" id="pill-${n.pill}" hidden></span>` : ""}</a>`).join("");
}

App.route = async function () {
  if (!App.user) return;
  const id = (location.hash.replace(/^#\//, "") || "dashboard").split("?")[0];
  const page = allowed().find(n => n.id === id) || allowed()[0];
  if (page.id !== id) { location.hash = "#/" + page.id; return; }
  $$("#nav a").forEach(a => a.classList.toggle("active", a.dataset.page === page.id));
  $("#page-title").textContent = page.title;
  $("#sidebar").classList.remove("open");
  const view = $("#view");
  try { await App.pages[page.id](view); }
  catch (e) { if (e.status !== 401) view.innerHTML = `<div class="alert bad"><b>Could not load this page</b><span>${esc(e.message)}</span></div>`; }
  refreshPill();
};

async function refreshPill() {
  try {
    const { refills } = await api("/insights/refills");
    const pill = $("#pill-refills"); if (pill) { pill.textContent = refills.length; pill.hidden = !refills.length; }
  } catch (_) { /* non-critical */ }
}

App.showLogin = function (msg) {
  $("#app").hidden = true; $("#login-screen").hidden = false;
  const er = $("#lg-error"); er.hidden = !msg; er.textContent = msg || "";
  $("#lg-pass").value = ""; $("#lg-user").focus();
  closeModal();
};
App.enter = function (user) {
  App.user = user;
  $("#login-screen").hidden = true; $("#app").hidden = false;
  $("#who-name").textContent = user.full_name; $("#who-role").textContent = user.role === "admin" ? "Administrator" : "Employee";
  $("#who-avatar").textContent = user.full_name.trim()[0].toUpperCase();
  buildNav();
  if (!location.hash || location.hash === "#/") location.hash = "#/dashboard";
  App.route();
};

App.actions.logout = async () => { try { await api("/auth/logout", { method: "POST" }); } catch (_) {} App.user = null; location.hash = ""; App.showLogin(); };

$("#login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = e.submitter; btn.disabled = true;
  try {
    const { user } = await api("/auth/login", { method: "POST", body: { username: $("#lg-user").value.trim(), password: $("#lg-pass").value } });
    App.enter(user);
  } catch (err) { App.showLogin(err.message); }
  finally { btn.disabled = false; }
});
window.addEventListener("hashchange", App.route);
setInterval(() => { const c = $("#clock"); if (c) c.textContent = new Date().toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }, 1000);

(async function boot() {
  try { const { user } = await api("/auth/me"); App.enter(user); }
  catch (_) { App.showLogin(); }
})();
