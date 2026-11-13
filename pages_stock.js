/* Medicines & batches, Inventory analysis, Reorder list, Refill reminders */

/* ================= MEDICINES ================= */
App.pages.medicines = async view => {
  const admin = App.user.role === "admin";
  view.innerHTML = `
    <div class="toolbar"><input id="med-q" type="search" placeholder="Search name, salt or category…">
      ${admin ? `<label class="check"><input type="checkbox" id="med-all"> Show inactive</label>` : ""}
      <span class="spacer"></span>${admin ? `<button class="btn primary" data-act="med-form">+ Add medicine</button><button class="btn" data-act="batch-form">+ Receive batch</button>` : ""}</div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Medicine</th><th>Generic (salt)</th><th>Category</th><th class="num">MRP</th><th class="num">Stock</th><th>Next expiry</th>${admin ? '<th class="num">Reorder at</th>' : ""}<th></th></tr></thead><tbody id="med-body"></tbody></table></div></div>`;
  const load = async () => {
    const q = encodeURIComponent($("#med-q").value.trim()), all = admin && $("#med-all").checked ? "&all=1" : "";
    const { medicines } = await api(`/medicines?q=${q}${all}`);
    App._meds = medicines;
    $("#med-body").innerHTML = medicines.length ? medicines.map(m => `<tr ${m.active ? "" : 'style="opacity:.5"'}>
      <td><b>${esc(m.name)}</b> ${m.requires_prescription ? rxBadge() : ""}${m.active ? "" : ' <span class="badge b-neutral">inactive</span>'}</td><td>${esc(m.generic_name)}</td><td>${esc(m.category)}</td>
      <td class="num">${inr(m.unit_price)}</td><td class="num">${m.stock > 0 ? num(m.stock) : '<span class="badge b-out">Out</span>'}</td><td>${fmtDate(m.next_expiry)}</td>${admin ? `<td class="num">${m.reorder_level}</td>` : ""}
      <td class="right nowrap"><button class="btn sm" data-act="view-batches" data-id="${m.id}" data-name="${esc(m.name)}">Batches</button>${admin ? ` <button class="btn sm" data-act="med-form" data-id="${m.id}">Edit</button>` : ""}</td></tr>`).join("") : emptyRow(8, "No medicines found");
  };
  App._reloadMeds = load;
  $("#med-q").oninput = debounce(load); if (admin) $("#med-all").onchange = load;
  try { await load(); } catch (e) { toast(e.message, "bad"); }
};

App.actions["view-batches"] = async el => {
  try {
    const admin = App.user.role === "admin";
    const { batches, medicine } = await api(`/medicines/${el.dataset.id}/batches`);
    modal({ title: "Batches – " + medicine, wide: true, body: `<p class="muted small" style="margin-top:0">Smart FEFO sells top-to-bottom: earliest expiry first. Expired batches are skipped automatically.</p>
      <div class="table-wrap"><table><thead><tr><th>Batch</th><th>Expiry</th><th>Status</th><th class="num">On hand</th>${admin ? '<th class="num">Received</th><th class="num">Cost</th>' : ""}<th class="num">Price</th><th class="num">Discount</th></tr></thead><tbody>
      ${batches.length ? batches.map(b => `<tr><td><b>${esc(b.batch_no)}</b></td><td>${fmtDate(b.expiry_date)}</td><td>${b.expired ? riskBadge("Expired") : `<span class="muted small">${daysLabel(b.days_left)}</span>`}</td><td class="num">${b.quantity}</td>${admin ? `<td class="num">${b.initial_quantity}</td><td class="num">${inr(b.cost_price)}</td>` : ""}<td class="num">${inr(b.selling_price)}</td><td class="num">${b.discount_pct ? `<span class="badge b-warn">${b.discount_pct}%</span>` : "–"}</td></tr>`).join("") : emptyRow(8, "No batches received yet")}
      </tbody></table></div>` });
  } catch (e) { toast(e.message, "bad"); }
};

App.actions["med-form"] = el => {
  const m = el.dataset.id ? App._meds.find(x => x.id === +el.dataset.id) : null;
  modal({ title: m ? "Edit " + m.name : "Add medicine", body: `<form id="med-form" class="stack">
      <div class="grid2"><label>Brand / name *<input name="name" required value="${esc(m?.name)}"></label><label>Generic (active salt) *<input name="generic_name" required value="${esc(m?.generic_name)}" placeholder="e.g. Paracetamol"></label></div>
      <div class="grid3"><label>Category *<input name="category" required value="${esc(m?.category || "General")}"></label><label>MRP per unit (₹) *<input name="unit_price" type="number" step="0.01" min="0.01" required value="${m?.unit_price ?? ""}"></label><label>GST % (in MRP)<select name="gst_rate">${[0, 5, 12, 18].map(g => `<option ${(m?.gst_rate ?? 12) === g ? "selected" : ""}>${g}</option>`).join("")}</select></label></div>
      <div class="grid2"><label>Reorder level (units)<input name="reorder_level" type="number" min="0" value="${m?.reorder_level ?? 20}"></label><label>Refill cycle (days) <input name="refill_days" type="number" min="1" value="${m?.refill_days ?? ""}" placeholder="Only for monthly/chronic medicines"></label></div>
      <label class="check"><input type="checkbox" name="requires_prescription" ${m?.requires_prescription ? "checked" : ""}> Prescription required (Schedule H / Rx-only)</label>
      ${m ? `<label class="check"><input type="checkbox" name="active" ${m.active ? "checked" : ""}> Active (uncheck to hide from billing)</label>` : ""}
      <p id="mf-err" class="form-error" hidden></p></form>`,
    foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="save-med" data-id="${m?.id || ""}">Save</button>` });
};
App.actions["save-med"] = async el => {
  const f = $("#med-form"); if (!f.reportValidity()) return;
  const fd = new FormData(f), body = Object.fromEntries(fd.entries());
  body.requires_prescription = f.requires_prescription.checked;
  if (f.active) body.active = f.active.checked;
  body.refill_days = body.refill_days || null;
  try {
    await api(el.dataset.id ? "/medicines/" + el.dataset.id : "/medicines", { method: el.dataset.id ? "PUT" : "POST", body });
    closeModal(); toast("Medicine saved", "good"); App.route();
  } catch (e) { const er = $("#mf-err"); er.textContent = e.message; er.hidden = false; }
};

App.actions["batch-form"] = async () => {
  const { medicines } = await api("/medicines");
  const in90 = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  modal({ title: "Receive new batch", body: `<form id="batch-form" class="stack">
    <label>Medicine *<select name="medicine_id" required>${medicines.map(m => `<option value="${m.id}" data-price="${m.unit_price}">${esc(m.name)}</option>`).join("")}</select></label>
    <div class="grid2"><label>Batch number *<input name="batch_no" required></label><label>Expiry date *<input name="expiry_date" type="date" required value="${in90}"></label></div>
    <div class="grid3"><label>Quantity *<input name="quantity" type="number" min="1" required></label><label>Cost price / unit *<input name="cost_price" type="number" step="0.01" min="0.01" required></label><label>Selling price / unit<input name="selling_price" type="number" step="0.01" min="0.01" placeholder="defaults to MRP"></label></div>
    <p id="bf-err" class="form-error" hidden></p></form>`,
    foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="save-batch">Add to stock</button>` });
};
App.actions["save-batch"] = async () => {
  const f = $("#batch-form"); if (!f.reportValidity()) return;
  const body = Object.fromEntries(new FormData(f).entries());
  if (!body.selling_price) body.selling_price = f.medicine_id.selectedOptions[0].dataset.price;
  try { await api("/batches", { method: "POST", body }); closeModal(); toast("Batch added to stock", "good"); App.route(); }
  catch (e) { const er = $("#bf-err"); er.textContent = e.message; er.hidden = false; }
};

/* ================= INVENTORY ANALYSIS (admin) ================= */
App.pages.inventory = async view => {
  view.innerHTML = `<div class="empty">Analysing stock, demand and expiry…</div>`;
  const { summary: s, medicines } = await api("/insights/inventory");
  App._inv = medicines;
  view.innerHTML = `
    <div class="stats">
      <div class="stat bad"><small>Expired stock lines</small><b>${s.expired}</b><em>remove from shelf</em></div>
      <div class="stat bad"><small>High expiry risk</small><b>${s.high}</b><em>likely to expire unsold</em></div>
      <div class="stat warn"><small>Medium risk</small><b>${s.medium}</b><em>watch closely</em></div>
      <div class="stat warn"><small>Low / out of stock</small><b>${s.low_stock}</b><em>reorder soon</em></div>
      <div class="stat bad"><small>Estimated expiry loss</small><b>${inr(s.estimated_loss)}</b><em>at cost price</em></div></div>
    <div class="alert info" style="margin-bottom:14px"><b>How the risk is calculated</b><span>Demand = recent-weighted units/day from the last 60 days. Each batch is sold in FEFO order, so a batch is “at risk” when demand cannot clear it (plus everything ahead of it) before its expiry date. Loss = unsold units × cost price.</span></div>
    <div class="toolbar"><input id="inv-q" type="search" placeholder="Filter medicine…"><select id="inv-f"><option value="">Everything</option><option value="risk">At risk (expired / high / medium)</option><option value="stock">Low or out of stock</option><option value="reorder">Needs reorder</option></select><span class="spacer"></span><a class="btn" href="#/reorder">Reorder list →</a></div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Medicine</th><th class="num">Valid stock</th><th class="num">Demand/day</th><th>Days of cover</th><th class="num">30-day forecast</th><th>Stock</th><th>Expiry risk</th><th class="num">Reorder qty</th><th class="num">Est. loss</th><th></th></tr></thead><tbody id="inv-body"></tbody></table></div></div>`;
  const draw = () => {
    const q = $("#inv-q").value.toLowerCase(), f = $("#inv-f").value;
    const rows = medicines.filter(m => (!q || (m.name + m.generic_name).toLowerCase().includes(q)) &&
      (!f || (f === "risk" && m.worst_risk !== "Low") || (f === "stock" && m.stock_status !== "OK") || (f === "reorder" && m.reorder_qty > 0)));
    $("#inv-body").innerHTML = rows.length ? rows.map(m => {
      const pct = m.days_of_cover == null ? 100 : Math.min(100, m.days_of_cover / 60 * 100);
      const col = m.days_of_cover != null && m.days_of_cover < 7 ? "var(--red)" : m.days_of_cover != null && m.days_of_cover < 21 ? "#e0a21b" : "var(--green)";
      return `<tr class="clickable" data-act="inv-detail" data-id="${m.medicine_id}"><td><b>${esc(m.name)}</b><br><small class="muted">${esc(m.generic_name)}</small></td><td class="num">${num(m.valid_stock)}</td><td class="num">${m.daily_demand}</td>
        <td>${m.days_of_cover == null ? '<span class="muted small">no sales</span>' : `<span class="cover"><i style="width:${pct}%;background:${col}"></i></span> <small>${m.days_of_cover}d</small>`}</td><td class="num">${num(m.forecast_30d)}</td><td>${stockBadge(m.stock_status)}</td><td>${riskBadge(m.worst_risk)}</td>
        <td class="num">${m.reorder_qty ? `<b>${num(m.reorder_qty)}</b>` : "–"}</td><td class="num">${m.expiry_loss ? `<span style="color:var(--red)">${inr(m.expiry_loss)}</span>` : "–"}</td><td class="right muted">›</td></tr>`;
    }).join("") : emptyRow(10, "No medicines match");
  };
  $("#inv-q").oninput = draw; $("#inv-f").onchange = draw; draw();
};

App.actions["inv-detail"] = el => {
  const m = App._inv.find(x => x.medicine_id === +el.dataset.id);
  modal({ title: m.name + " – batch risk", wide: true, body: `
    <p class="muted" style="margin-top:0">Demand ${m.daily_demand}/day · forecast ${m.forecast_30d} units in 30 days · reorder level ${m.reorder_level}</p>
    <div class="table-wrap"><table><thead><tr><th>Batch</th><th>Expiry</th><th class="num">On hand</th><th>Risk</th><th class="num">Likely unsold</th><th class="num">Est. loss</th><th class="num">Discount</th><th></th></tr></thead><tbody>
    ${m.batches.length ? m.batches.map(b => `<tr><td><b>${esc(b.batch_no)}</b></td><td>${fmtDate(b.expiry)}<br><small class="muted">${daysLabel(b.days_left)}</small></td><td class="num">${b.quantity}</td><td>${riskBadge(b.risk)}</td><td class="num">${b.at_risk_units || "–"}</td><td class="num">${b.est_loss ? inr(b.est_loss) : "–"}</td><td class="num">${b.discount_pct ? b.discount_pct + "%" : "–"}</td>
      <td class="right nowrap">${b.risk === "Expired" ? '<small class="muted">Remove from shelf</small>' : b.suggested_discount && b.suggested_discount !== b.discount_pct ? `<button class="btn primary sm" data-act="clearance" data-id="${b.batch_id}" data-pct="${b.suggested_discount}">Apply ${b.suggested_discount}% clearance</button>` : b.discount_pct ? `<button class="btn sm" data-act="clearance" data-id="${b.batch_id}" data-pct="0">Remove discount</button>` : ""}</td></tr>`).join("") : emptyRow(8, "No stock on hand")}
    </tbody></table></div>
    <p class="muted small">Clearance discounts are capped so the price never drops below cost. Billing applies the discount automatically to that batch.</p>` });
};
App.actions.clearance = async el => {
  try { await api(`/batches/${el.dataset.id}/discount`, { method: "POST", body: { discount_pct: +el.dataset.pct } });
    toast(+el.dataset.pct ? `${el.dataset.pct}% clearance applied` : "Discount removed", "good"); closeModal(); App.route(); }
  catch (e) { toast(e.message, "bad"); }
};

/* ================= REORDER LIST (admin) ================= */
App.pages.reorder = async view => {
  const r = await api("/insights/reorder");
  view.innerHTML = `
    <div class="toolbar"><span class="muted">Suggested quantity = 30-day forecast + reorder level − stock that will actually sell before expiry.</span><span class="spacer"></span><button class="btn primary" data-act="print-po">🖨 Print purchase order</button></div>
    <div class="card" id="po"><div class="card-head"><h2>Draft purchase order</h2><span class="spacer"></span><span class="muted">${fmtDate(r.generated)}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Medicine</th><th>Generic</th><th class="num">In stock</th><th class="num">30-day forecast</th><th class="num">Order qty</th><th class="num">Est. cost</th><th>Urgency</th></tr></thead><tbody>
      ${r.lines.length ? r.lines.map(l => `<tr><td><b>${esc(l.name)}</b></td><td>${esc(l.generic_name)}</td><td class="num">${num(l.current_stock)}</td><td class="num">${num(l.forecast_30d)}</td><td class="num"><b>${num(l.suggested_qty)}</b></td><td class="num">${inr(l.est_cost)}</td><td>${stockBadge(l.status)}</td></tr>`).join("") : emptyRow(7, "Nothing needs reordering right now")}
      </tbody><tfoot><tr><td colspan="5" class="right"><b>Estimated total</b></td><td class="num"><b>${inr(r.total)}</b></td><td></td></tr></tfoot></table></div></div>`;
};
App.actions["print-po"] = () => {
  const html = $("#po").outerHTML;
  modal({ title: "Purchase order", wide: true, body: html, foot: `<button class="btn" data-act="close-modal">Close</button><button class="btn primary" data-act="print">🖨 Print</button>` });
};

/* ================= REFILL REMINDERS ================= */
App.pages.refills = async view => {
  const { refills } = await api("/insights/refills");
  const grouped = {};
  refills.forEach(r => (grouped[r.phone] ||= { customer: r.customer, phone: r.phone, items: [] }).items.push(r));
  const people = Object.values(grouped);
  view.innerHTML = `<div class="alert info" style="margin-bottom:14px"><b>Refill reminders</b><span>Regular patients whose monthly medicine is due within 3 days (or up to 10 days overdue). Click WhatsApp to send a ready-made message – nothing is sent automatically.</span></div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Medicines due</th><th>Due</th><th></th></tr></thead><tbody>
    ${people.length ? people.map(p => {
      const soonest = Math.min(...p.items.map(i => i.days_to_due));
      const names = p.items.map(i => i.medicine).join(", ");
      const msg = `Hello ${p.customer}, this is ${App.PHARMACY.name}. Your monthly medicines (${names}) are due for a refill. We have them in stock – visit us or reply to this message. Take care!`;
      return `<tr><td><b>${esc(p.customer)}</b><br><small class="muted">${esc(p.phone)}</small></td><td>${p.items.map(i => `<span class="badge b-neutral" style="margin:1px">${esc(i.medicine)}</span>`).join(" ")}</td>
        <td>${soonest < 0 ? `<span class="badge b-bad">${-soonest}d overdue</span>` : soonest === 0 ? '<span class="badge b-warn">today</span>' : `<span class="badge b-info">in ${soonest}d</span>`}</td>
        <td class="right"><a class="btn sm primary" target="_blank" rel="noopener" href="https://wa.me/91${encodeURIComponent(p.phone)}?text=${encodeURIComponent(msg)}">WhatsApp</a></td></tr>`;
    }).join("") : emptyRow(4, "No refills due 🎉")}</tbody></table></div></div>`;
};
