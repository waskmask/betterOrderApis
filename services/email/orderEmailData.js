const { escapeHtml } = require("./escapeHtml");
const { renderPartial } = require("./renderEmail");
const { pickLang } = require("./emailTemplateRegistry");

const LABELS = {
  en: {
    delivery: "Delivery",
    takeaway: "Take-away",
    cod: "Cash on delivery",
    paypal: "PayPal",
    online: "Online payment",
    paid: "Paid",
    pending: "Pending",
    refund_pending: "Refund pending",
    asap: "ASAP",
  },
  de: {
    delivery: "Lieferung",
    takeaway: "Abholung",
    cod: "Barzahlung",
    paypal: "PayPal",
    online: "Onlinezahlung",
    paid: "Bezahlt",
    pending: "Ausstehend",
    refund_pending: "Rückerstattung ausstehend",
    asap: "Schnellstmöglich",
  },
};

function formatMoney(cents, lang) {
  const value = (Number(cents || 0) / 100).toFixed(2);
  return lang === "de" ? `${value.replace(".", ",")} €` : `€${value}`;
}

function label(lang, key) {
  const resolved = pickLang(lang);
  return LABELS[resolved]?.[key] || LABELS.en[key] || key;
}

function customerName(order) {
  const first = String(order?.customer?.firstName || "").trim();
  const last = String(order?.customer?.lastName || "").trim();
  return escapeHtml([first, last].filter(Boolean).join(" ") || "Customer");
}

function formatAddress(order) {
  const addr = order?.fulfillment?.address || {};
  const parts = [
    [addr.street, addr.company].filter(Boolean).join(", "),
    [addr.postalCode, addr.city].filter(Boolean).join(" "),
    addr.floor ? `Floor ${addr.floor}` : "",
  ].filter(Boolean);
  return escapeHtml(parts.join("\n")).replace(/\n/g, "<br>");
}

function buildLineRows(items = [], lang = "en") {
  const resolvedLang = lang === "de" ? "de" : "en";
  return items
    .map((item) => {
      const name = escapeHtml(item.itemNameSnapshot || "Item");
      const qty = Number(item.quantity || 0);
      const total = formatMoney(item.lineTotalCents, resolvedLang);
      const extras = [];
      if (item.size?.labelSnapshot) extras.push(escapeHtml(item.size.labelSnapshot));
      (item.extras || []).forEach((e) => extras.push(escapeHtml(e.labelSnapshot)));
      (item.addons || []).forEach((a) => extras.push(escapeHtml(a.optionNameSnapshot)));
      const detail = extras.length
        ? `<br><span style="font-size:12px;color:#717171;">${extras.join(", ")}</span>`
        : "";
      const note = item.note
        ? `<br><span style="font-size:12px;color:#717171;">Note: ${escapeHtml(item.note)}</span>`
        : "";
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#222;">${name}${detail}${note}</td>
        <td align="center" style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;">${qty}</td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;">${total}</td>
      </tr>`;
    })
    .join("");
}

async function buildOrderEmailData(order, lang, extras = {}) {
  const resolvedLang = pickLang(lang);
  const totals = order.totals || {};
  const lineRows = buildLineRows(order.items || [], resolvedLang);
  const orderLinesHtml = await renderPartial("order-lines-table", resolvedLang, {
    orderLines: lineRows,
  });
  const totalsHtml = await renderPartial("order-totals", resolvedLang, {
    subtotal: formatMoney(totals.subtotalCents, resolvedLang),
    deliveryFee:
      totals.deliveryFeeCents > 0
        ? formatMoney(totals.deliveryFeeCents, resolvedLang)
        : "",
    discount:
      totals.discountCents > 0
        ? `-${formatMoney(totals.discountCents, resolvedLang)}`
        : "",
    tip: totals.tipCents > 0 ? formatMoney(totals.tipCents, resolvedLang) : "",
    orderTotal: formatMoney(totals.totalCents, resolvedLang),
  });

  const customerAppUrl = process.env.CUSTOMER_APP_URL || "http://localhost:4003";
  const trackOrderUrl = `${customerAppUrl}/order-success?order=${order._id}&token=${order.customerAccessToken || ""}`;

  let acceptedEta = "";
  if (order.fulfillment?.acceptedEtaAt) {
    acceptedEta = new Date(order.fulfillment.acceptedEtaAt).toLocaleString(
      resolvedLang === "de" ? "de-DE" : "en-GB",
      { dateStyle: "short", timeStyle: "short" }
    );
  } else if (order.fulfillment?.acceptedDeliveryMinutes) {
    acceptedEta =
      resolvedLang === "de"
        ? `ca. ${order.fulfillment.acceptedDeliveryMinutes} Min.`
        : `approx. ${order.fulfillment.acceptedDeliveryMinutes} min`;
  }

  const requestedTime =
    order.fulfillment?.fulfillmentType === "scheduled" && order.fulfillment?.requestedFor
      ? new Date(order.fulfillment.requestedFor).toLocaleString(
          resolvedLang === "de" ? "de-DE" : "en-GB",
          { dateStyle: "short", timeStyle: "short" }
        )
      : label(resolvedLang, "asap");

  return {
    orderNumber: escapeHtml(order.orderNumber),
    restaurantName: escapeHtml(order.restaurant?.nameSnapshot || "Restaurant"),
    customerName: customerName(order),
    customerEmail: escapeHtml(order.customer?.email || ""),
    customerPhone: escapeHtml(order.customer?.phone || ""),
    fulfillmentMode: label(resolvedLang, order.fulfillment?.mode || "delivery"),
    requestedTime: escapeHtml(requestedTime),
    acceptedEta: escapeHtml(acceptedEta),
    deliveryAddress: formatAddress(order),
    orderLinesHtml,
    totalsHtml,
    paymentMethod: label(resolvedLang, order.payment?.method || "cod"),
    paymentStatus: label(resolvedLang, order.payment?.status || "pending"),
    rejectReason: escapeHtml(order.rejectReason || extras.rejectReason || ""),
    trackOrderUrl: escapeHtml(trackOrderUrl),
    orderTotal: formatMoney(totals.totalCents, resolvedLang),
    adminOrderUrl: escapeHtml(
      extras.adminOrderUrl ||
        `${process.env.ADMIN_APP_URL || "http://localhost:3000"}/orders`
    ),
    ...extras,
  };
}

function buildReviewInviteData(order, lang, reviewUrl, expiresAt) {
  const resolvedLang = pickLang(lang);
  const first = String(order?.customer?.firstName || "").trim();
  return {
    name: escapeHtml(first || (resolvedLang === "de" ? "du" : "there")),
    restaurantName: escapeHtml(order.restaurant?.nameSnapshot || "Restaurant"),
    orderNumber: escapeHtml(order.orderNumber),
    reviewUrl: escapeHtml(reviewUrl),
    expiresAt: escapeHtml(
      expiresAt.toLocaleString(resolvedLang === "de" ? "de-DE" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    ),
  };
}

function buildAuthEmailData({ name, actionUrl, lang }) {
  const resolvedLang = pickLang(lang);
  return {
    name: escapeHtml(name || (resolvedLang === "de" ? "du" : "there")),
    actionUrl: escapeHtml(actionUrl || ""),
  };
}

module.exports = {
  buildOrderEmailData,
  buildReviewInviteData,
  buildAuthEmailData,
  formatMoney,
  customerName,
};
