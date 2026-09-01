const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
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
const RECEIPT_WIDTH = 32;

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

function sanitizeLine(text, maxLen = RECEIPT_WIDTH) {
  const cleaned = transliterateGerman(text)
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/[ \t]+$/g, "")
    .replace(/[ \t]{2,}/g, " ");
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLen - 1))}…`;
}

function formatCents(cents) {
  return `${(Number(cents || 0) / 100).toFixed(2).replace(".", ",")} EUR`;
}

function formatMoneyShort(cents) {
  return `${(Number(cents || 0) / 100).toFixed(2).replace(".", ",")}`;
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
    year: "numeric",
  });
}

function padRow(left, right, width = RECEIPT_WIDTH) {
  const rightText = String(right || "");
  const leftMax = Math.max(0, width - rightText.length - 1);
  let leftText = sanitizeLine(left, leftMax);
  if (leftText.length > leftMax) leftText = leftText.slice(0, leftMax);
  const spaces = Math.max(1, width - leftText.length - rightText.length);
  return `${leftText}${" ".repeat(spaces)}${rightText}`;
}

function restaurantMeta(order, restaurant = null) {
  const fromOrder = order?.restaurant || {};
  const address =
    restaurant?.address ||
    fromOrder.addressSnapshot ||
    {};
  const addressLine = [
    [address.street, address.houseNumber].filter(Boolean).join(" "),
    [address.postalCode, address.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return {
    name: restaurant?.restaurant_name || fromOrder.nameSnapshot || "Restaurant",
    phone: restaurant?.phoneNumber || fromOrder.phoneSnapshot || "",
    email: restaurant?.email || fromOrder.emailSnapshot || "",
    addressLine,
    vatNumber: restaurant?.vat_number || "",
    logoPath: restaurant?.images?.logo || "",
  };
}

function itemModifierRows(item) {
  const rows = [];
  if (item.size?.labelSnapshot) {
    rows.push({
      label: `  ${item.size.labelSnapshot}`,
      cents: Number(item.size.priceCents || 0),
    });
  }
  for (const option of item.dressing?.options || []) {
    rows.push({
      label: `  + ${option.labelSnapshot}`,
      cents: Number(option.priceCents || 0),
    });
  }
  for (const extra of item.extras || []) {
    rows.push({
      label: `  + ${extra.labelSnapshot}`,
      cents: Number(extra.priceCents || 0),
    });
  }
  for (const addon of item.addons || []) {
    rows.push({
      label: `  + ${addon.optionNameSnapshot || addon.addonNameSnapshot}`,
      cents: Number(addon.priceCents || 0),
    });
  }
  return rows;
}

function resolveLogoUrl(logoPath) {
  const raw = String(logoPath || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const publicBase = (process.env.R2_PUBLIC_URL || process.env.PUBLIC_BASE_URL || "")
    .replace(/\/$/, "");
  if (publicBase) {
    return `${publicBase}${raw.startsWith("/") ? raw : `/${raw}`}`;
  }
  return null;
}

async function loadLogoImageBuffer(logoPath) {
  const raw = String(logoPath || "").trim();
  if (!raw) return null;

  try {
    if (!/^https?:\/\//i.test(raw)) {
      const { getObjectBuffer } = require("../utils/r2Storage");
      const key = raw.replace(/^\/+/, "");
      const fromR2 = await getObjectBuffer(key);
      if (fromR2?.length) return fromR2;

      const localPath = path.join(__dirname, "..", raw.replace(/^\/+/, ""));
      if (fs.existsSync(localPath)) return fs.readFileSync(localPath);
    }

    const url = resolveLogoUrl(raw);
    if (!url) return null;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function buildLogoRasterCommand(logoPath, maxWidthDots = 384) {
  const imageBuffer = await loadLogoImageBuffer(logoPath);
  if (!imageBuffer?.length) return null;

  try {
    const sharp = require("sharp");
    const widthDots = Math.min(maxWidthDots, 384);
    const { data, info } = await sharp(imageBuffer)
      .resize({
        width: widthDots,
        withoutEnlargement: true,
        fit: "inside",
      })
      .greyscale()
      .normalize()
      .threshold(170)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const widthBytes = Math.ceil(width / 8);
    const raster = Buffer.alloc(widthBytes * height, 0);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = data[y * width + x];
        if (pixel < 128) {
          raster[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
        }
      }
    }

    const header = Buffer.from([
      ...Buffer.from(`${GS}v0\x00`, "binary"),
      widthBytes & 0xff,
      (widthBytes >> 8) & 0xff,
      height & 0xff,
      (height >> 8) & 0xff,
    ]);
    return Buffer.concat([header, raster]);
  } catch {
    return null;
  }
}

function createTicketWriter() {
  const chunks = [];
  const push = (value) => {
    if (Buffer.isBuffer(value)) chunks.push(value);
    else chunks.push(Buffer.from(value, "binary"));
  };
  const line = (text = "") => push(`${sanitizeLine(text)}\n`);
  const rawLine = (text = "") => push(`${text}\n`);
  const divider = (char = "-") => line(char.repeat(RECEIPT_WIDTH));
  const row = (left, right) => rawLine(padRow(left, right));
  const center = (enabled = true) => push(enabled ? `${ESC}a\x01` : `${ESC}a\x00`);
  const bold = (enabled = true) => push(enabled ? `${ESC}E\x01` : `${ESC}E\x00`);
  const doubleSize = (enabled = true) => push(enabled ? `${GS}!\x11` : `${GS}!\x00`);

  return {
    push,
    line,
    rawLine,
    divider,
    row,
    center,
    bold,
    doubleSize,
    toBuffer: () => Buffer.concat(chunks),
  };
}

function writeRestaurantHeader(ticket, meta, { showAddress = true } = {}) {
  ticket.center(true);
  ticket.bold(true);
  ticket.doubleSize(true);
  ticket.line(meta.name);
  ticket.doubleSize(false);
  ticket.bold(false);
  if (showAddress && meta.addressLine) ticket.line(meta.addressLine);
  if (showAddress && meta.phone) ticket.line(`Tel: ${meta.phone}`);
  ticket.center(false);
}

function writeItemBlock(ticket, item, { showPrices = true } = {}) {
  const qty = Number(item.quantity || 1);
  const name = item.itemNameSnapshot || "Item";
  if (showPrices) {
    ticket.bold(true);
    ticket.row(`${qty}x ${name}`, formatMoneyShort(item.lineTotalCents));
    ticket.bold(false);
  } else {
    ticket.bold(true);
    ticket.line(`${qty}x ${name}`);
    ticket.bold(false);
  }

  for (const modifier of itemModifierRows(item)) {
    if (showPrices && modifier.cents > 0) {
      ticket.row(modifier.label, formatMoneyShort(modifier.cents * qty));
    } else {
      ticket.line(modifier.label);
    }
  }

  if (item.note) ticket.line(`  * ${item.note}`);
}

function writeTotalsBlock(ticket, order) {
  const totals = order.totals || {};
  ticket.divider();
  ticket.row("Zwischensumme", formatMoneyShort(totals.subtotalCents));
  if (Number(totals.deliveryFeeCents || 0) > 0) {
    ticket.row("Lieferung", formatMoneyShort(totals.deliveryFeeCents));
  }
  if (Number(totals.discountCents || 0) > 0) {
    ticket.row("Rabatt", `-${formatMoneyShort(totals.discountCents)}`);
  }
  if (Number(totals.tipCents || 0) > 0) {
    ticket.row("Trinkgeld", formatMoneyShort(totals.tipCents));
  }
  ticket.divider("=");
  ticket.bold(true);
  ticket.row("SUMME", formatCents(totals.totalCents));
  ticket.bold(false);
  ticket.line("inkl. MwSt.");
}

async function buildReceiptTicketBuffer(order, restaurant = null, options = {}) {
  const ticket = createTicketWriter();
  const meta = restaurantMeta(order, restaurant);

  ticket.push(`${ESC}@`);

  const logoRaster =
    options.logoRaster ||
    (meta.logoPath ? await buildLogoRasterCommand(meta.logoPath) : null);
  if (logoRaster) {
    ticket.center(true);
    ticket.push(logoRaster);
    ticket.line("");
    ticket.center(false);
  }

  writeRestaurantHeader(ticket, meta, { showAddress: true });
  ticket.divider();
  ticket.row("Beleg", `#${order.orderNumber}`);
  ticket.row(
    order.fulfillment?.mode === "takeaway" ? "Abholung" : "Lieferung",
    formatTime(order.createdAt)
  );

  const customerName = [order.customer?.firstName, order.customer?.lastName]
    .filter(Boolean)
    .join(" ");
  if (customerName) ticket.line(`Kunde: ${customerName}`);
  if (order.customer?.phone) ticket.line(`Tel: ${order.customer.phone}`);

  if (order.fulfillment?.mode === "delivery") {
    const address = order.fulfillment?.address || {};
    const addressLine = [address.street, address.postalCode, address.city]
      .filter(Boolean)
      .join(", ");
    if (addressLine) ticket.line(`Adr: ${addressLine}`);
  }

  ticket.divider();
  for (const item of order.items || []) {
    writeItemBlock(ticket, item, { showPrices: true });
  }

  writeTotalsBlock(ticket, order);

  if (order.payment?.method) {
    ticket.line(`Zahlung: ${String(order.payment.method).replace(/_/g, " ").toUpperCase()}`);
  }
  if (meta.vatNumber) ticket.line(`USt-IdNr: ${meta.vatNumber}`);

  ticket.line("");
  ticket.center(true);
  ticket.line("Vielen Dank!");
  ticket.center(false);
  ticket.line("");
  ticket.push(`${GS}V\x00`);

  return ticket.toBuffer();
}

async function buildKitchenTicketBuffer(order, restaurant = null, options = {}) {
  const ticket = createTicketWriter();
  const meta = restaurantMeta(order, restaurant);

  ticket.push(`${ESC}@`);

  const logoRaster =
    options.logoRaster ||
    (meta.logoPath ? await buildLogoRasterCommand(meta.logoPath) : null);
  if (logoRaster) {
    ticket.center(true);
    ticket.push(logoRaster);
    ticket.line("");
    ticket.center(false);
  }

  writeRestaurantHeader(ticket, meta, { showAddress: false });
  ticket.divider();
  ticket.bold(true);
  ticket.line(`#${order.orderNumber}`);
  ticket.bold(false);
  ticket.line(
    order.fulfillment?.mode === "takeaway"
      ? "ABHOLUNG / TAKEAWAY"
      : "LIEFERUNG / DELIVERY"
  );
  ticket.line(`Zeit: ${formatTime(order.createdAt)}`);

  const customerName = [order.customer?.firstName, order.customer?.lastName]
    .filter(Boolean)
    .join(" ");
  if (customerName) ticket.line(`Kunde: ${customerName}`);
  if (order.customer?.phone) ticket.line(`Tel: ${order.customer.phone}`);

  if (order.fulfillment?.mode === "delivery") {
    const address = order.fulfillment?.address || {};
    const addressLine = [address.street, address.postalCode, address.city]
      .filter(Boolean)
      .join(", ");
    if (addressLine) ticket.line(`Adr: ${addressLine}`);
    if (address.floor) ticket.line(`Etage: ${address.floor}`);
    if (address.company) ticket.line(`Firma: ${address.company}`);
  }

  if (order.fulfillment?.deliveryNote) {
    ticket.line(`Hinweis: ${order.fulfillment.deliveryNote}`);
  }

  const etaMinutes = order.fulfillment?.acceptedDeliveryMinutes;
  if (etaMinutes) {
    ticket.line(`ETA: ${etaMinutes} Min`);
    if (order.fulfillment?.acceptedEtaAt) {
      ticket.line(`Bis: ${formatTime(order.fulfillment.acceptedEtaAt)}`);
    }
  }

  ticket.divider();
  ticket.bold(true);
  ticket.line("POSITIONEN");
  ticket.bold(false);

  for (const item of order.items || []) {
    writeItemBlock(ticket, item, { showPrices: true });
  }

  writeTotalsBlock(ticket, order);

  if (order.payment?.method) {
    ticket.line(`Zahlung: ${String(order.payment.method).replace(/_/g, " ").toUpperCase()}`);
  }

  ticket.line("");
  ticket.push(`${GS}V\x00`);
  return ticket.toBuffer();
}

function buildBarTicketBuffer(order) {
  const ticket = createTicketWriter();
  ticket.push(`${ESC}@`);
  ticket.bold(true);
  ticket.line("BAR");
  ticket.bold(false);
  ticket.line(`#${order.orderNumber}`);
  ticket.line(formatTime(order.createdAt));
  ticket.divider();

  for (const item of order.items || []) {
    writeItemBlock(ticket, item, { showPrices: false });
  }

  ticket.line("");
  ticket.push(`${GS}V\x00`);
  return ticket.toBuffer();
}

async function buildTicketBufferForRole(order, printRole = "KITCHEN", restaurant = null, options = {}) {
  const role = String(printRole || "KITCHEN").toUpperCase();
  if (role === "RECEIPT") return buildReceiptTicketBuffer(order, restaurant, options);
  if (role === "BAR") return buildBarTicketBuffer(order);
  return buildKitchenTicketBuffer(order, restaurant, options);
}

async function buildKitchenTicketPayload(order, restaurant = null) {
  const buffer = await buildKitchenTicketBuffer(order, restaurant);
  return {
    payloadBase64: buffer.toString("base64"),
    byteLength: buffer.length,
  };
}

async function buildTicketPayloadForRole(order, printRole = "KITCHEN", restaurant = null, options = {}) {
  const buffer = await buildTicketBufferForRole(order, printRole, restaurant, options);
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
  const restaurantDoc =
    restaurant && typeof restaurant.toObject === "function" ? restaurant.toObject() : restaurant;
  const createdJobs = [];

  const logoRaster = restaurantDoc?.images?.logo
    ? await buildLogoRasterCommand(restaurantDoc.images.logo)
    : null;
  const ticketOptions = logoRaster ? { logoRaster } : {};

  for (const { role, printer } of targets) {
    const idempotencyKey = printJobIdempotencyKey(order._id, source, printer.key, role);
    const existing = await PrintJob.findOne({ idempotencyKey }).lean();
    if (existing) {
      createdJobs.push(existing);
      continue;
    }

    const { payloadBase64 } = await buildTicketPayloadForRole(
      orderDoc,
      role,
      restaurantDoc,
      ticketOptions
    );
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
  itemModifierRows,
  padRow,
  formatCents,
};
