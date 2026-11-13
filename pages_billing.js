/* Dashboard, Billing (POS with Smart FEFO), Invoice, Returns, Sales history */

/* ================= DASHBOARD ================= */
App.pages.dashboard = async view => {
  view.innerHTML = `<div class="empty">Loading dashboard…</div>`;
  const d = await api("/insights/dashboard");
  const admin = App.user.role === "admin";
  const stats = [
    ["", "Sales today", inr(d.today_total), `${d.today_bills} bills · ${num(d.today_items)} units`],
    ...(admin ? [["info", "Today's margin", inr(d.today_margin), "selling price − batch cost"]] : []),
    ["warn", "Expiry alerts", d.expiry_alert_count, "batches expired or high risk"],
    ["bad", "Low / out of stock", d.low_stock_count, "below reorder level or <7 days cover"],
    ...(admin ? [["bad", "Estimated expiry loss", inr(d.estimated_loss), "predicted unsold before expiry"],
                 ["info", "Stock value (at cost)", inr(d.stock_value), "valid, non-expired stock"]] : []),
    ["info", "Refills due", d.refills_due, "regular patients to remind"],
  ];
  view.innerHTML = `
    <div class="stats">${stats.map(([k, t, v, s]) => `<div class="stat ${k}"><small>${t}</small><b>${v}</b><em>${s}</em></div>`).join("")}</div>
    <div class="cols">
      <section class="card"><h2>${admin ? "Sales" : "My sales"} – last 14 days</h2>${barChart(d.sales_series)}</section>
      ${admin ? `<section class="card"><h2>Top sellers (30 days, units)</h2>${d.top_medicines.length ? hbars(d.top_medicines.map(t => ({ label: t.name, value: t.units }))) : '<p class="empty">No sales yet</p>'}</section>` : ""}
      <section class="card"><div class="card-head"><h2>Expiry alerts</h2><span class="spacer"></span>${admin ? '<a href="#/inventory" class="small">Full analysis →</a>' : ""}</div>
        <div class="list">${d.expiry_alerts.length ? d.expiry_alerts.map(a => `<div class="item-row"><div class="grow"><b>${esc(a.medicine)}</b><br><small class="muted">Batch ${esc(a.batch_no)} · ${a.quantity} units · ${daysLabel(a.days_left)}</small></div>${riskBadge(a.risk)}</div>`).join("") : '<p class="empty">No batches at risk 🎉</p>'}</div></section>
      <section class="card"><div class="card-head"><h2>Stock alerts</h2></div>
        <div class="list">${d.low_stock.length ? d.low_stock.map(a => `<div class="item-row"><div class="grow"><b>${esc(a.name)}</b><br><small class="muted">${a.stock} units available</small></div>${stockBadge(a.status)}</div>`).join("") : '<p class="empty">All stock levels healthy</p>'}</div></section>
    </div>`;
};

/* ================= BILLING ================= */
App.pages.billing = view => {
  App.cart = [];
  view.innerHTML = `
  <div class="pos">
    <section class="card">
      <div class="card-head"><h2>1 · Find medicine</h2></div>
      <input id="med-search" type="search" placeholder="Search by brand, salt or category…" autocomplete="off">
      <div id="med-results" style="margin-top:12px"></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>2 · Bill</h2><span class="spacer"></span><button class="btn sm ghost" data-act="clear-cart">Clear</button></div>
      <div class="table-wrap"><table><thead><tr><th>Medicine</th><th>Qty</th><th></th></tr></thead><tbody id="cart-body"></tbody></table></div>
      <div id="plan" class="plan"></div>
      <div class="total-bar"><span>Total <small class="muted">(GST included)</small></span><b id="grand">₹0.00</b></div>
      <div class="stack">
        <div class="grid2">
          <label>Customer phone<input id="c-phone" inputmode="numeric" maxlength="12" placeholder="Optional for OTC"></label>
          <label>Customer name<input id="c-name" placeholder="Optional for OTC"></label>
        </div>
        <div id="rx-box" class="alert warn" hidden>
          <b>℞ Prescription medicine in this bill</b>
          <div class="grid2" style="margin-top:6px"><label>Doctor's name *<input id="rx-doc" placeholder="Dr. …"></label><label>Doctor reg. no.<input id="rx-reg" placeholder="Optional"></label></div>
          <small>Customer name and phone are mandatory. The prescription is stored with the sale.</small>
        </div>
        <div class="grid2">
          <label>Payment<select id="pay"><option>Cash</option><option>UPI</option><option>Card</option></select></label>
          <div style="display:flex;align-items:end"><button id="gen" class="btn primary block" data-act="generate" disabled>Generate bill</button></div>
        </div>
      </div>
    </section>
  </div>`;
  const search = debounce(async () => {
    const q = $("#med-search").value.trim();
    try {
      const { medicines } = await api("/medicines?q=" + encodeURIComponent(q));
      $("#med-results").innerHTML = medicines.length ? medicines.map(m => `
        <div class="med-card">
          <div class="grow"><b>${esc(m.name)} ${m.requires_prescription ? rxBadge() : ""}</b>
            <small class="muted">${esc(m.generic_name)} · ${inr(m.unit_price)}/unit</small><br>
            <small>${m.stock > 0 ? `<span style="color:var(--green)">${num(m.stock)} in stock</span> · earliest exp ${fmtDate(m.next_expiry)}` : '<span style="color:var(--red)">Out of stock</span>'}</small></div>
          ${m.stock > 0 ? `<button class="btn primary sm" data-act="add-med" data-id="${m.id}" data-name="${esc(m.name)}" data-rx="${m.requires_prescription ? 1 : 0}">Add</button>`
            : `<button class="btn sm" data-act="find-sub" data-id="${m.id}" data-name="${esc(m.name)}">Substitutes</button>`}
        </div>`).join("") : `<p class="empty">No medicine matches “${esc(q)}”</p>`;
    } catch (e) { toast(e.message, "bad"); }
  }, 250);
  $("#med-search").addEventListener("input", search);
  $("#med-search").focus();
  search();
  $("#c-phone").addEventListener("input", debounce(() => { lookupCustomer(); refreshPlan(); }, 400));
  renderCart();
};

async function lookupCustomer() {
  const phone = $("#c-phone")?.value.trim();
  if (!phone || phone.length < 8) return;
  try {
    const { customer } = await api("/customers/lookup?phone=" + encodeURIComponent(phone));
    if (customer && !$("#c-name").value) { $("#c-name").value = customer.name; toast("Returning customer: " + customer.name, "good"); }
  } catch (_) { /* ignore */ }
}

function renderCart() {
  const body = $("#cart-body"); if (!body) return;
  body.innerHTML = App.cart.length ? App.cart.map((c, i) => `
    <tr><td><b>${esc(c.name)}</b> ${c.rx ? rxBadge() : ""}</td>
    <td><div class="qty"><button data-act="qty-dec" data-i="${i}" aria-label="Decrease">−</button><input type="number" min="1" value="${c.qty}" data-i="${i}" class="qty-in" aria-label="Quantity"><button data-act="qty-inc" data-i="${i}" aria-label="Increase">+</button></div></td>
    <td class="right"><button class="btn ghost sm" data-act="rm-item" data-i="${i}" aria-label="Remove">✕</button></td></tr>`).join("")
    : emptyRow(3, "Search a medicine on the left and click Add");
  $("#rx-box").hidden = !App.cart.some(c => c.rx);
  $("#gen").disabled = !App.cart.length;
  refreshPlan();
}

const refreshPlan = debounce(async () => {
  const plan = $("#plan"); if (!plan) return;
  if (!App.cart.length) { plan.innerHTML = ""; $("#grand").textContent = inr(0); App.lastPreview = null; return; }
  try {
    const p = await api("/billing/preview", { method: "POST", body: { items: App.cart.map(c => ({ medicine_id: c.id, quantity: c.qty })), customer_phone: $("#c-phone").value.trim() } });
    App.lastPreview = p;
    $("#grand").textContent = inr(p.total);
    $("#gen").disabled = p.lines.some(l => l.shortfall > 0);
    plan.innerHTML = `<h3>Smart FEFO batch plan</h3>` + p.lines.map(l => `
      <div class="line-plan"><b>${esc(l.name)}</b> <small class="muted">× ${l.requested}</small>
        ${l.slices.map(s => `<div class="slice"><span class="tag">Batch ${esc(s.batch_no)}</span><span>exp ${fmtDate(s.expiry)}</span><span>${s.quantity} × ${inr(s.unit_price)}</span>${s.discount_pct ? `<span class="badge b-warn">${s.discount_pct}% clearance</span>` : ""}<b style="margin-left:auto">${inr(s.amount)}</b></div>`).join("")}
        ${l.shortfall ? `<div class="alert bad" style="margin-top:6px"><b>Only ${l.requested - l.shortfall} available</b> (expired stock is never sold). Reduce quantity${l.substitutes?.length ? " or swap to the same-salt alternative:" : "."}
          <div>${(l.substitutes || []).map(s => `<button class="chip" data-act="swap" data-from="${l.medicine_id}" data-to="${s.id}" data-name="${esc(s.name)}" data-rx="${s.requires_prescription ? 1 : 0}">${esc(s.name)} · ${inr(s.price)} (${s.stock} in stock)</button>`).join(" ")}</div></div>` : ""}
      </div>`).join("") + (p.interactions.length ? `<div class="list">${p.interactions.map(w => `<div class="alert ${w.severity === "Major" ? "bad" : w.severity === "Moderate" ? "warn" : "info"}"><b>⚠ ${esc(w.severity)} interaction: ${esc(w.a)} + ${esc(w.b)}</b><span>${esc(w.note)} <small>(${esc(w.source)})</small></span></div>`).join("")}</div>` : "");
  } catch (e) { plan.innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; }
}, 250);

Object.assign(App.actions, {
  "add-med": el => {
    const id = +el.dataset.id, ex = App.cart.find(c => c.id === id);
    if (ex) ex.qty += 1; else App.cart.push({ id, name: el.dataset.name, qty: 1, rx: el.dataset.rx === "1" });
    renderCart();
  },
  "qty-inc": el => { App.cart[+el.dataset.i].qty += 1; renderCart(); },
  "qty-dec": el => { const c = App.cart[+el.dataset.i]; c.qty = Math.max(1, c.qty - 1); renderCart(); },
  "rm-item": el => { App.cart.splice(+el.dataset.i, 1); renderCart(); },
  "clear-cart": () => { App.cart = []; renderCart(); },
  swap: el => {
    const from = +el.dataset.from, to = +el.dataset.to;
    const old = App.cart.find(c => c.id === from);
    if (!old) return;
    if (App.cart.some(c => c.id === to)) { App.cart = App.cart.filter(c => c.id !== from); }
    else { Object.assign(old, { id: to, name: el.dataset.name, rx: el.dataset.rx === "1" }); }
    renderCart(); toast("Swapped to " + el.dataset.name, "good");
  },
  "find-sub": async el => {
    try {
      const { substitutes } = await api(`/medicines/${el.dataset.id}/substitutes`);
      modal({ title: "Substitutes for " + el.dataset.name, body: substitutes.length
        ? `<p class="muted" style="margin-top:0">Same active salt, in stock, cheapest first.</p><div class="list">${substitutes.map(s => `<div class="item-row"><div class="grow"><b>${esc(s.name)}</b> ${s.requires_prescription ? rxBadge() : ""}<br><small class="muted">${s.stock} in stock · ${inr(s.price)}/unit${s.saving > 0 ? ` · saves ${inr(s.saving)}/unit` : ""}</small></div><button class="btn primary sm" data-act="add-med" data-id="${s.id}" data-name="${esc(s.name)}" data-rx="${s.requires_prescription ? 1 : 0}">Add</button></div>`).join("")}</div>`
        : '<p class="empty">No in-stock alternative with the same salt. Consider asking the doctor for another option.</p>' });
    } catch (e) { toast(e.message, "bad"); }
  },
  generate: async (el, ev, ack = false) => {
    const rxNeeded = App.cart.some(c => c.rx);
    const payload = {
      items: App.cart.map(c => ({ medicine_id: c.id, quantity: c.qty })),
      customer: { phone: $("#c-phone").value.trim(), name: $("#c-name").value.trim() },
      prescription: rxNeeded ? { doctor_name: $("#rx-doc").value.trim(), doctor_reg_no: $("#rx-reg").value.trim() } : null,
      payment_mode: $("#pay").value, ack_interactions: ack,
    };
    if (rxNeeded && (!payload.customer.name || !payload.customer.phone || !payload.prescription.doctor_name))
      return toast("Prescription medicine: enter customer name, phone and the doctor's name", "bad");
    const btn = $("#gen"); btn.disabled = true;
    try {
      const { sale } = await api("/sales", { method: "POST", body: payload });
      toast("Bill " + sale.invoice_no + " created", "good");
      App.cart = []; $("#c-phone").value = $("#c-name").value = ""; $("#rx-doc") && ($("#rx-doc").value = $("#rx-reg").value = "");
      renderCart(); $("#med-search").dispatchEvent(new Event("input"));
      showInvoice(sale);
    } catch (e) {
      btn.disabled = false;
      if (e.status === 409 && e.data?.interactions) {
        const ok = await confirmBox("Drug interaction – pharmacist check",
          e.data.interactions.map(w => `<div class="alert ${w.severity === "Major" ? "bad" : "warn"}" style="margin-bottom:8px"><b>${esc(w.severity)}: ${esc(w.a)} + ${esc(w.b)}</b><span>${esc(w.note)}</span></div>`).join("") +
          `<p style="margin-bottom:0"><b>Only continue if the prescriber has intended this combination.</b> This confirmation is recorded in the audit log.</p>`, "I confirm – proceed", true);
        if (ok) App.actions.generate(el, ev, true);
      } else { toast(e.message, "bad"); refreshPlan(); }
    }
  },
});
document.addEventListener("change", e => {
  if (e.target.classList.contains("qty-in")) {
    const v = Math.max(1, parseInt(e.target.value, 10) || 1);
    App.cart[+e.target.dataset.i].qty = v; renderCart();
  }
});

/* ================= INVOICE ================= */
function showInvoice(s, { allowReturn = false } = {}) {
  const P = App.PHARMACY;
  modal({ title: "Invoice " + s.invoice_no, wide: true,
    body: `<div class="invoice">
      <div class="inv-head"><div><h2>${esc(P.name)}</h2><small>${esc(P.addr)}<br>GSTIN ${esc(P.gstin)} · ${esc(P.dl)}</small></div>
        <div class="right"><b>${esc(s.invoice_no)}</b><br><small>${esc(s.when)}<br>Cashier: ${esc(s.cashier)}<br>Payment: ${esc(s.payment_mode)}</small></div></div>
      <p style="margin:0 0 10px"><b>Customer:</b> ${esc(s.customer)}${s.phone ? " · " + esc(s.phone) : ""}${s.doctor ? `<br><b>Prescribed by:</b> ${esc(s.doctor)}${s.doctor_reg_no ? " (" + esc(s.doctor_reg_no) + ")" : ""}` : ""}</p>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Medicine</th><th>Batch</th><th>Exp</th><th class="num">Qty</th><th class="num">MRP</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>
      ${s.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.medicine)}${i.returned_qty ? `<br><small style="color:var(--red)">${i.returned_qty} returned</small>` : ""}</td><td>${esc(i.batch_no)}</td><td>${esc(i.expiry)}</td><td class="num">${i.quantity}</td><td class="num">${i.mrp.toFixed(2)}</td><td class="num">${i.unit_price.toFixed(2)}</td><td class="num">${i.line_total.toFixed(2)}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="sums">${s.discount_given > 0 ? `<div><span>Clearance discount</span><span>− ${inr(s.discount_given)}</span></div>` : ""}<div><span>GST included</span><span>${inr(s.gst_included)}</span></div><div class="grand"><span>Total</span><span>${inr(s.total)}</span></div></div>
      ${s.returns?.length ? `<div class="alert warn" style="margin-top:12px">${s.returns.map(r => `<span>Credit note <b>${esc(r.credit_note_no)}</b> · ${esc(r.when)} · ${inr(r.total)}${r.reason ? " · " + esc(r.reason) : ""}</span>`).join("")}</div>` : ""}
      <div class="foot">Prices are MRP-inclusive of GST. Medicines once sold are not returnable except as per policy. Get well soon!</div></div>`,
    foot: `${allowReturn && s.status !== "Returned" ? `<button class="btn" data-act="return-form" data-id="${s.id}">Return items</button>` : ""}<button class="btn" data-act="close-modal">Close</button><button class="btn primary" data-act="print">🖨 Print</button>`,
    onMount: () => { App._invoice = s; } });
}

App.actions["return-form"] = () => {
  const s = App._invoice;
  const rows = s.items.filter(i => i.quantity - i.returned_qty > 0);
  modal({ title: "Return items – " + s.invoice_no, wide: true,
    body: `<div class="table-wrap"><table><thead><tr><th>Medicine</th><th>Batch</th><th class="num">Sold</th><th class="num">Returnable</th><th class="num">Return qty</th></tr></thead><tbody>
      ${rows.map(i => `<tr><td>${esc(i.medicine)}</td><td>${esc(i.batch_no)}</td><td class="num">${i.quantity}</td><td class="num">${i.quantity - i.returned_qty}</td><td class="num"><input type="number" class="ret-q" data-item="${i.id}" min="0" max="${i.quantity - i.returned_qty}" value="0" style="width:80px"></td></tr>`).join("")}</tbody></table></div>
      <div class="grid2" style="margin-top:12px"><label>Reason<select id="ret-reason"><option>Wrong medicine dispensed</option><option>Doctor changed prescription</option><option>Damaged / defective</option><option>Customer request</option></select></label>
      <label class="check" style="align-self:end"><input type="checkbox" id="ret-restock" checked> Put back on shelf (restock)</label></div>
      <p class="muted small">Restocking adds units back to their original batch. Untick if the pack is damaged or opened.</p>`,
    foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="submit-return" data-id="${s.id}">Issue credit note</button>` });
};
App.actions["submit-return"] = async el => {
  const lines = $$(".ret-q").map(i => ({ sale_item_id: +i.dataset.item, quantity: parseInt(i.value, 10) || 0 })).filter(l => l.quantity > 0);
  if (!lines.length) return toast("Enter a quantity to return", "bad");
  try {
    const r = await api(`/sales/${el.dataset.id}/return`, { method: "POST", body: { lines, reason: $("#ret-reason").value, restock: $("#ret-restock").checked } });
    toast(`Credit note ${r.credit_note_no} · refund ${inr(r.total)}`, "good");
    const { sale } = await api("/sales/" + el.dataset.id);
    showInvoice(sale, { allowReturn: true });
    if (location.hash === "#/sales") App.pages.sales($("#view"));
  } catch (e) { toast(e.message, "bad"); }
};

/* ================= SALES HISTORY ================= */
App.pages.sales = async view => {
  const admin = App.user.role === "admin";
  if (!$("#sales-q")) view.innerHTML = `
    <div class="toolbar"><input id="sales-q" type="search" placeholder="Invoice no., customer name or phone…">
      <select id="sales-days"><option value="">All time</option><option value="1">Today</option><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option></select>
      <span class="spacer"></span><span class="muted small">${admin ? "All bills" : "Showing only your bills"}</span></div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th>${admin ? "<th>Cashier</th>" : ""}<th>Payment</th><th class="num">Total</th><th>Status</th><th></th></tr></thead><tbody id="sales-body"></tbody></table></div></div>`;
  const load = async () => {
    const { sales } = await api(`/sales?q=${encodeURIComponent($("#sales-q").value.trim())}&days=${$("#sales-days").value}`);
    $("#sales-body").innerHTML = sales.length ? sales.map(s => `<tr class="clickable" data-act="open-sale" data-id="${s.id}"><td><b>${esc(s.invoice_no)}</b> ${s.has_rx ? rxBadge() : ""}</td><td class="nowrap">${esc(s.when)}</td><td>${esc(s.customer)}</td>${admin ? `<td>${esc(s.cashier)}</td>` : ""}<td>${esc(s.payment_mode)}</td><td class="num">${inr(s.total)}</td><td><span class="badge ${s.status === "Completed" ? "b-ok" : "b-warn"}">${esc(s.status)}</span></td><td class="right"><button class="btn sm" data-act="open-sale" data-id="${s.id}">View</button></td></tr>`).join("") : emptyRow(admin ? 8 : 7, "No bills found");
  };
  $("#sales-q").oninput = debounce(load); $("#sales-days").onchange = load;
  try { await load(); } catch (e) { toast(e.message, "bad"); }
};
App.actions["open-sale"] = async el => {
  try { const { sale } = await api("/sales/" + el.dataset.id); showInvoice(sale, { allowReturn: true }); }
  catch (e) { toast(e.message, "bad"); }
};
