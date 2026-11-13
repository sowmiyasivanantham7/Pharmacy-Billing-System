/* Employees, Interaction rules, Rx register, Audit log, Change password */

App.pages.employees = async view => {
  const { employees } = await api("/employees");
  view.innerHTML = `<div class="toolbar"><span class="muted">Disabled accounts cannot sign in; their bills stay in the history.</span><span class="spacer"></span><button class="btn primary" data-act="emp-form">+ Add employee</button></div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th class="num">Bills today</th><th class="num">Sales today</th><th>Status</th><th></th></tr></thead><tbody>
    ${employees.map(u => `<tr><td><b>${esc(u.full_name)}</b></td><td>${esc(u.username)}</td><td><span class="badge ${u.role === "admin" ? "b-rx" : "b-neutral"}">${esc(u.role)}</span></td><td class="num">${u.today_bills}</td><td class="num">${inr(u.today_total)}</td>
      <td>${u.active ? '<span class="badge b-ok">Active</span>' : '<span class="badge b-bad">Disabled</span>'}</td>
      <td class="right nowrap"><button class="btn sm" data-act="emp-toggle" data-id="${u.id}" data-active="${u.active ? 1 : 0}">${u.active ? "Disable" : "Enable"}</button> <button class="btn sm" data-act="emp-reset" data-id="${u.id}" data-name="${esc(u.full_name)}">Reset password</button></td></tr>`).join("")}
    </tbody></table></div></div>`;
};
App.actions["emp-form"] = () => modal({ title: "Add employee", body: `<form id="emp-form" class="stack">
  <label>Full name *<input name="full_name" required></label>
  <div class="grid2"><label>Username *<input name="username" required autocomplete="off"></label><label>Role<select name="role"><option value="employee">Employee</option><option value="admin">Admin</option></select></label></div>
  <label>Temporary password * <small>(min 8 characters)</small><input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
  <p id="ef-err" class="form-error" hidden></p></form>`,
  foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="save-emp">Create</button>` });
App.actions["save-emp"] = async () => {
  const f = $("#emp-form"); if (!f.reportValidity()) return;
  try { await api("/employees", { method: "POST", body: Object.fromEntries(new FormData(f).entries()) }); closeModal(); toast("Employee created", "good"); App.route(); }
  catch (e) { const er = $("#ef-err"); er.textContent = e.message; er.hidden = false; }
};
App.actions["emp-toggle"] = async el => {
  const disable = el.dataset.active === "1";
  if (disable && !(await confirmBox("Disable account?", "They will be signed out and cannot log in until re-enabled.", "Disable", true))) return;
  try { await api("/employees/" + el.dataset.id, { method: "PATCH", body: { active: !disable } }); App.route(); } catch (e) { toast(e.message, "bad"); }
};
App.actions["emp-reset"] = el => modal({ title: "Reset password – " + el.dataset.name, body: `<form id="rp-form" class="stack"><label>New password * <small>(min 8 characters)</small><input name="password" type="password" minlength="8" required autocomplete="new-password"></label><p id="rp-err" class="form-error" hidden></p></form>`,
  foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="save-reset" data-id="${el.dataset.id}">Reset</button>` });
App.actions["save-reset"] = async el => {
  const f = $("#rp-form"); if (!f.reportValidity()) return;
  try { await api("/employees/" + el.dataset.id, { method: "PATCH", body: { password: f.password.value } }); closeModal(); toast("Password reset", "good"); }
  catch (e) { const er = $("#rp-err"); er.textContent = e.message; er.hidden = false; }
};

/* ----- interaction rules ----- */
App.pages.interactions = async view => {
  const admin = App.user.role === "admin";
  const { interactions } = await api("/interactions");
  view.innerHTML = `<div class="alert warn" style="margin-bottom:14px"><b>Educational rule set</b><span>These starter rules power the interaction warnings at billing. They are a teaching aid, not a clinical database – always follow the pharmacist's judgement and an official drug reference.</span></div>
    <div class="toolbar"><span class="spacer"></span>${admin ? '<button class="btn primary" data-act="rule-form">+ Add rule</button>' : ""}</div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Severity</th><th>Salt A</th><th>Salt B</th><th>Note</th>${admin ? "<th></th>" : ""}</tr></thead><tbody>
    ${interactions.map(r => `<tr><td>${riskBadge(r.severity)}</td><td>${esc(r.generic_a)}</td><td>${esc(r.generic_b)}</td><td>${esc(r.note)}</td>${admin ? `<td class="right"><button class="btn sm" data-act="rule-del" data-id="${r.id}">Delete</button></td>` : ""}</tr>`).join("")}</tbody></table></div></div>`;
};
App.actions["rule-form"] = () => modal({ title: "Add interaction rule", body: `<form id="rule-form" class="stack">
  <div class="grid2"><label>Generic A *<input name="generic_a" required placeholder="e.g. Warfarin"></label><label>Generic B *<input name="generic_b" required placeholder="e.g. Aspirin"></label></div>
  <label>Severity<select name="severity"><option>Major</option><option selected>Moderate</option><option>Minor</option></select></label>
  <label>Note *<textarea name="note" rows="3" maxlength="300" required></textarea></label><p id="rl-err" class="form-error" hidden></p></form>`,
  foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="save-rule">Save</button>` });
App.actions["save-rule"] = async () => {
  const f = $("#rule-form"); if (!f.reportValidity()) return;
  try { await api("/interactions", { method: "POST", body: Object.fromEntries(new FormData(f).entries()) }); closeModal(); App.route(); }
  catch (e) { const er = $("#rl-err"); er.textContent = e.message; er.hidden = false; }
};
App.actions["rule-del"] = async el => { if (await confirmBox("Delete rule?", "Billing will no longer warn about this combination.", "Delete", true)) { await api("/interactions/" + el.dataset.id, { method: "DELETE" }); App.route(); } };

/* ----- Rx register ----- */
App.pages.rxregister = async view => {
  const { register } = await api("/rx-register");
  view.innerHTML = `<div class="card"><div class="card-head"><h2>Prescription dispensing register</h2><span class="spacer"></span><button class="btn" data-act="print">🖨 Print</button></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Patient</th><th>Doctor</th><th>Reg. no.</th><th>Rx medicines dispensed</th><th>Invoice</th></tr></thead><tbody>
  ${register.length ? register.map(r => `<tr><td class="nowrap">${esc(r.when)}</td><td>${esc(r.patient)}<br><small class="muted">${esc(r.phone || "")}</small></td><td>${esc(r.doctor)}</td><td>${esc(r.reg_no || "–")}</td><td>${esc(r.medicines)}</td><td>${esc(r.invoice_no)}</td></tr>`).join("") : emptyRow(6, "No prescriptions recorded yet")}</tbody></table></div></div>`;
};

/* ----- audit log ----- */
App.pages.audit = async view => {
  const { log } = await api("/audit");
  view.innerHTML = `<div class="card"><div class="card-head"><h2>Audit trail <small class="muted">(latest 200 events)</small></h2></div><div class="table-wrap"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Details</th></tr></thead><tbody>
  ${log.map(l => `<tr><td class="nowrap">${esc(l.when)}</td><td>${esc(l.user)}</td><td><span class="badge ${/FAIL|DISABLE|DEL|RETURN/.test(l.action) ? "b-warn" : "b-neutral"}">${esc(l.action)}</span></td><td>${esc(l.detail)}</td></tr>`).join("")}</tbody></table></div></div>`;
};

/* ----- change password ----- */
App.actions["change-password"] = () => modal({ title: "Change password", body: `<form id="cp-form" class="stack">
  <label>Current password<input name="old_password" type="password" required autocomplete="current-password"></label>
  <label>New password <small>(min 8 characters)</small><input name="new_password" type="password" minlength="8" required autocomplete="new-password"></label><p id="cp-err" class="form-error" hidden></p></form>`,
  foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="save-cp">Update</button>` });
App.actions["save-cp"] = async () => {
  const f = $("#cp-form"); if (!f.reportValidity()) return;
  try { await api("/auth/change-password", { method: "POST", body: Object.fromEntries(new FormData(f).entries()) }); closeModal(); toast("Password updated", "good"); }
  catch (e) { const er = $("#cp-err"); er.textContent = e.message; er.hidden = false; }
};
