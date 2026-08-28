const crypto = require("crypto");
const PrintJob = require("../modals/PrintJob");
const { isPrintEligible } = require("./orderScheduleService");
const {
  getPrintersForRoles,
  hasEnabledPrinters,
  printerTargetSnapshot,
  resolvePrintRolesOnAccept,
  PRINT_ROLES,
} = require("./printerConfigService");

const ESC = "\x1b";
const GS = "\x1d";

function transliterateGerman(text) {
  return String(text || "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss");
}

function sanitizeLine(text, maxLen = 42) {
  const cleaned = transliterateGerman(text).replace(/[^\x20-\x7E]/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1)}…`;
}

function formatCents(cents) {
  return `${(Number(cents || 0) / 100).toFixed(2).replace(".", ",")} EUR`;
}

function formatTime(value) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

function buildKitchenTicketBuffer(order) {
  const chunks = [];
  const push = (value) => chunks.push(Buffer.from(value, "binary"));
  const line = (text = "") => push(`${sanitizeLine(text)}\n`);
  const divider = () => line("-".repeat(32));

  push(`${ESC}@`);
  push(`${ESC}a\x01`);
  push(`${ESC}E\x01`);
  line("BETTERORDER");
  push(`${ESC}E\x00`);
  line(order.restaurant?.nameSnapshot || "Restaurant");
  push(`${ESC}a\x00`);
  divider();

  push(`${ESC}E\x01`);
  line(`#${order.orderNumber}`);
  push(`${ESC}E\x00`);
  line(
    order.fulfillment?.mode === "takeaway"
      ? "ABHOLUNG / TAKEAWAY"
      : "LIEFERUNG / DELIVERY"
  );
  line(`Status: ${String(order.status || "").replace(/_/g, " ").toUpperCase()}`);
  line(`Zeit: ${formatTime(order.createdAt)}`);
  divider();

  const customerName = [order.customer?.firstName, order.customer?.lastName]
    .filter(Boolean)
    .join(" ");
  if (customerName) line(`Kunde: ${customerName}`);
  if (order.customer?.phone) line(`Tel: ${order.customer.phone}`);

  if (order.fulfillment?.mode === "delivery") {
    const address = order.fulfillment?.address || {};
    const addressLine = [address.street, address.postalCode, address.city]
      .filter(Boolean)
      .join(", ");
    if (addressLine) line(`Adr: ${addressLine}`);
    if (address.floor) line(`Etage: ${address.floor}`);
    if (address.company) line(`Firma: ${address.company}`);
  }

  if (order.fulfillment?.deliveryNote) {
    line(`Hinweis: ${order.fulfillment.deliveryNote}`);
  }

  const etaMinutes = order.fulfillment?.acceptedDeliveryMinutes;
  if (etaMinutes) {
    line(`ETA: ${etaMinutes} Min`);
    if (order.fulfillment?.acceptedEtaAt) {
      line(`Bis: ${formatTime(order.fulfillment.acceptedEtaAt)}`);
    }
  }

  divider();
  push(`${ESC}E\x01`);
  line("POSITIONEN");
  push(`${ESC}E\x00`);

  for (const item of order.items || []) {
    const qty = Number(item.quantity || 1);
    line(`${qty}x ${item.itemNameSnapshot}`);
    const options = [
      item.size?.labelSnapshot,
      ...(item.dressing?.options || []).map((entry) => entry.labelSnapshot),
      ...(item.extras || []).map((entry) => entry.labelSnapshot),
      ...(item.addons || []).map((entry) => entry.optionNameSnapshot),
    ].filter(Boolean);
    if (options.length) line(`   ${options.join(", ")}`);
    if (item.note) line(`   * ${item.note}`);
    line(`   ${formatCents(item.lineTotalCents)}`);
  }

  divider();
  push(`${ESC}E\x01`);
  line(`GESAMT: ${formatCents(order.totals?.totalCents)}`);
  push(`${ESC}E\x00`);

  if (order.payment?.method) {
    line(`Zahlung: ${String(order.payment.method).toUpperCase()}`);
  }

  line("");
  line("--- Ende ---");
  line("");
  push(`${GS}V\x00`);

  return Buffer.concat(chunks);
}

function buildReceiptTicketBuffer(order) {
  const chunks = [];
  const push = (value) => chunks.push(Buffer.from(value, "binary"));
  const line = (text = "") => push(`${sanitizeLine(text)}\n`);

  push(`${ESC}@`);
  push(`${ESC}a\x01`);
  line("BETTERORDER");
  line(order.restaurant?.nameSnapshot || "Restaurant");
  push(`${ESC}a\x00`);
  line(`#${order.orderNumber}`);
  line(formatTime(order.createdAt));
  line("");

  for (const item of order.items || []) {
    line(`${Number(item.quantity || 1)}x ${item.itemNameSnapshot}`);
    line(`   ${formatCents(item.lineTotalCents)}`);
  }

  line("");
  push(`${ESC}E\x01`);
  line(`TOTAL: ${formatCents(order.totals?.totalCents)}`);
  push(`${ESC}E\x00`);
  line("");
  push(`${GS}V\x00`);

  return Buffer.concat(chunks);
}

function buildBarTicketBuffer(order) {
  const chunks = [];
  const push = (value) => chunks.push(Buffer.from(value, "binary"));
  const line = (text = "") => push(`${sanitizeLine(text)}\n`);

  push(`${ESC}@`);
  push(`${ESC}E\x01`);
  line("BAR");
  push(`${ESC}E\x00`);
  line(`#${order.orderNumber}`);
  line(formatTime(order.createdAt));
  line("");

  for (const item of order.items || []) {
    line(`${Number(item.quantity || 1)}x ${item.itemNameSnapshot}`);
    if (item.note) line(`   * ${item.note}`);
  }

  line("");
  push(`${GS}V\x00`);
  return Buffer.concat(chunks);
}

function buildTicketBufferForRole(order, printRole = "KITCHEN") {
  const role = String(printRole || "KITCHEN").toUpperCase();
  if (role === "RECEIPT") return buildReceiptTicketBuffer(order);
  if (role === "BAR") return buildBarTicketBuffer(order);
  return buildKitchenTicketBuffer(order);
}

function buildKitchenTicketPayload(order) {
  const buffer = buildKitchenTicketBuffer(order);
  return {
    payloadBase64: buffer.toString("base64"),
    byteLength: buffer.length,
  };
}

function buildTicketPayloadForRole(order, printRole = "KITCHEN") {
  const buffer = buildTicketBufferForRole(order, printRole);
  return {
    payloadBase64: buffer.toString("base64"),
    byteLength: buffer.length,
    printRole: String(printRole || "KITCHEN").toUpperCase(),
  };
}

function printJobIdempotencyKey(orderId, source = "accept", printerKey = "default", printRole = "KITCHEN") {
  const key = String(printerKey || "default");
  const role = String(printRole || "KITCHEN").toUpperCase();
  if (source === "accept") return `accept:${orderId}:${role}:${key}`;
  return `reprint:${orderId}:${role}:${key}:${Date.now()}`;
}

function resolveRolesToEnqueue(restaurant, { source = "accept", roles = null } = {}) {
  if (Array.isArray(roles) && roles.length) {
    return roles.map((role) => String(role).toUpperCase()).filter((role) => PRINT_ROLES.includes(role));
  }
  if (source === "reprint") {
    return PRINT_ROLES.filter((role) => getPrintersForRoles(restaurant, [role]).length > 0);
  }
  return resolvePrintRolesOnAccept(restaurant);
}

async function enqueuePrintJob(order, restaurant, { source = "accept", force = false, roles = null } = {}) {
  const settings = restaurant?.orderSettings || {};
  if (!force && settings.autoPrintOnAccept === false) return null;
  if (!force && !hasEnabledPrinters(restaurant)) return null;
  if (!force && source === "accept" && !isPrintEligible(order)) return null;

  const rolesToPrint = resolveRolesToEnqueue(restaurant, { source, roles });
  const targets = getPrintersForRoles(restaurant, rolesToPrint);
  if (!targets.length) return null;

  const orderDoc = typeof order.toObject === "function" ? order.toObject() : order;
  const createdJobs = [];

  for (const { role, printer } of targets) {
    const idempotencyKey = printJobIdempotencyKey(order._id, source, printer.key, role);
    const existing = await PrintJob.findOne({ idempotencyKey }).lean();
    if (existing) {
      createdJobs.push(existing);
      continue;
    }

    const { payloadBase64 } = buildTicketPayloadForRole(orderDoc, role);
    const copies = Math.min(Math.max(Number(printer.copies) || 1, 1), 3);

    try {
      const job = await PrintJob.create({
        restaurantId: order.restaurant?.restaurantId || restaurant._id,
        orderId: order._id,
        orderNumber: order.orderNumber,
        idempotencyKey,
        printRole: role,
        printerKey: printer.key,
        printerName: printer.name,
        printerTarget: printerTargetSnapshot(printer),
        payloadBase64,
        copies,
        source,
        status: "pending",
      });
      createdJobs.push(job);
    } catch (error) {
      if (error?.code === 11000) {
        const duplicate = await PrintJob.findOne({ idempotencyKey }).lean();
        if (duplicate) createdJobs.push(duplicate);
        continue;
      }
      throw error;
    }
  }

  return createdJobs[0] || null;
}

function hashPrintAgentToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function generatePrintAgentToken() {
  return crypto.randomBytes(32).toString("hex");
}

function isPrintAgentHealthy(lastSeenAt, maxAgeMs = 90_000) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() <= maxAgeMs;
}

module.exports = {
  buildKitchenTicketBuffer,
  buildKitchenTicketPayload,
  buildTicketBufferForRole,
  buildTicketPayloadForRole,
  enqueuePrintJob,
  hashPrintAgentToken,
  generatePrintAgentToken,
  isPrintAgentHealthy,
  printJobIdempotencyKey,
};
