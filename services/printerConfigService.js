const crypto = require("crypto");

const PRINT_ROLES = ["KITCHEN", "RECEIPT", "BAR"];

const printerEntrySchema = {
  key: { type: String, required: true },
  name: { type: String, default: "Printer" },
  enabled: { type: Boolean, default: true },
  roles: { type: [String], default: ["KITCHEN"] },
  connection: {
    type: { type: String, enum: ["tcp", "serial", "windows"], default: "tcp" },
    host: { type: String, default: "" },
    port: { type: Number, default: 9100 },
    baudRate: { type: Number, default: 9600 },
    printerName: { type: String, default: "" },
  },
  copies: { type: Number, default: 1, min: 1, max: 3 },
};

function createPrinterKey() {
  return crypto.randomBytes(6).toString("hex");
}

function normalizeComPort(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (/^COM\d+$/.test(raw)) return raw;
  if (/^\d+$/.test(raw)) return `COM${raw}`;
  return raw;
}

function normalizePrintRoles(raw) {
  const values = Array.isArray(raw) ? raw : [raw];
  const roles = values
    .map((entry) => String(entry || "").trim().toUpperCase())
    .filter((entry) => PRINT_ROLES.includes(entry));
  return roles.length ? [...new Set(roles)] : ["KITCHEN"];
}

function legacyConnectionFromFlat(raw = {}) {
  const connectionType = String(raw.connectionType || "network").trim().toLowerCase();
  if (connectionType === "bluetooth") {
    const serialPort = normalizeComPort(raw.serialPort || raw.connection?.port);
    if (serialPort) {
      return {
        type: "serial",
        port: serialPort,
        baudRate: Number.parseInt(raw.baudRate || raw.connection?.baudRate || "9600", 10) || 9600,
        host: "",
        printerName: "",
      };
    }
    const printerName = String(raw.windowsPrinterName || raw.connection?.printerName || "").trim();
    if (printerName) {
      return { type: "windows", printerName, host: "", port: 9100, baudRate: 9600 };
    }
    return { type: "serial", port: "", baudRate: 9600, host: "", printerName: "" };
  }

  const tcpPort = Number.parseInt(raw.port ?? raw.connection?.port ?? "9100", 10);
  return {
    type: "tcp",
    host: String(raw.host || raw.connection?.host || "").trim(),
    port: Number.isFinite(tcpPort) && tcpPort >= 1 && tcpPort <= 65535 ? tcpPort : 9100,
    baudRate: 9600,
    printerName: "",
  };
}

function normalizeConnection(raw = {}) {
  if (raw.connection && typeof raw.connection === "object") {
    const type = String(raw.connection.type || "tcp").trim().toLowerCase();
    if (type === "serial") {
      const port = normalizeComPort(raw.connection.port || raw.connection.serialPort);
      const baudRate = Number.parseInt(raw.connection.baudRate || "9600", 10) || 9600;
      return { type: "serial", port, baudRate, host: "", printerName: "" };
    }
    if (type === "windows") {
      return {
        type: "windows",
        printerName: String(raw.connection.printerName || raw.connection.windowsPrinterName || "").trim(),
        host: "",
        port: 9100,
        baudRate: 9600,
      };
    }
    const tcpPort = Number.parseInt(raw.connection.port ?? "9100", 10);
    return {
      type: "tcp",
      host: String(raw.connection.host || "").trim().slice(0, 120),
      port: Number.isFinite(tcpPort) && tcpPort >= 1 && tcpPort <= 65535 ? tcpPort : 9100,
      baudRate: 9600,
      printerName: "",
    };
  }

  return legacyConnectionFromFlat(raw);
}

function normalizePrinterEntry(raw = {}, index = 0) {
  const copies = Number.parseInt(raw.copies, 10);
  const connection = normalizeConnection(raw);

  return {
    key: String(raw.key || createPrinterKey()).trim().slice(0, 32) || createPrinterKey(),
    name: String(raw.name || `Printer ${index + 1}`).trim().slice(0, 80) || `Printer ${index + 1}`,
    enabled: raw.enabled !== false,
    roles: normalizePrintRoles(raw.roles),
    connection,
    copies: Number.isFinite(copies) && copies >= 1 && copies <= 3 ? copies : 1,
    // Legacy flat fields — TCP port stays numeric; COM ports go to serialPort only
    connectionType:
      connection.type === "tcp" ? "network" : "bluetooth",
    host: connection.type === "tcp" ? connection.host : "",
    port: connection.type === "tcp" ? connection.port : 9100,
    serialPort: connection.type === "serial" ? String(connection.port || "") : "",
    windowsPrinterName: connection.type === "windows" ? connection.printerName : "",
    baudRate: connection.baudRate || 9600,
  };
}

function legacyPrinterFromConfig(printerConfig = {}) {
  const normalized = normalizePrinterEntry(
    {
      key: "legacy",
      name: "Kitchen printer",
      roles: ["KITCHEN"],
      ...printerConfig,
      enabled: Boolean(printerConfig.enabled),
    },
    0
  );
  const hasTarget = connectionIsComplete(normalized.connection);
  return normalized.enabled && hasTarget ? [normalized] : [];
}

function normalizeRestaurantPrinters(restaurant = {}) {
  const rawPrinters = Array.isArray(restaurant.printers) ? restaurant.printers : [];
  if (rawPrinters.length) {
    return rawPrinters.map((entry, index) => normalizePrinterEntry(entry, index));
  }
  return legacyPrinterFromConfig(restaurant.printerConfig || {});
}

function isAgentRecentlyOnline(lastSeenAt, maxAgeMs = 90_000) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() <= maxAgeMs;
}

function normalizeDiscoveredPrinters(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 12)
    .map((entry, index) =>
      normalizePrinterEntry(
        {
          ...entry,
          key: entry.key || `discovered-${index + 1}`,
          roles: entry.roles || ["KITCHEN"],
          enabled: true,
        },
        index
      )
    )
    .filter((printer) => connectionIsComplete(printer.connection));
}

function connectionIsComplete(connection = {}) {
  if (connection.type === "tcp") return Boolean(connection.host);
  if (connection.type === "serial") return Boolean(connection.port);
  if (connection.type === "windows") return Boolean(connection.printerName);
  return false;
}

function getConfiguredEnabledPrinters(restaurant = {}) {
  return normalizeRestaurantPrinters(restaurant).filter((printer) => printer.enabled);
}

function getDiscoveredEnabledPrinters(restaurant = {}) {
  if (!isAgentRecentlyOnline(restaurant.printAgentLastSeenAt)) return [];
  return normalizeDiscoveredPrinters(restaurant.printAgentDiscoveredPrinters);
}

function getEnabledPrinters(restaurant = {}) {
  const configured = getConfiguredEnabledPrinters(restaurant);
  if (configured.length) return configured;

  const autoDetect = restaurant.orderSettings?.autoDetectPrinters !== false;
  if (!autoDetect) return [];

  return getDiscoveredEnabledPrinters(restaurant);
}

function getPrintersForRole(restaurant = {}, role) {
  const normalizedRole = String(role || "").trim().toUpperCase();
  return getEnabledPrinters(restaurant).filter(
    (printer) => printer.enabled && printer.roles.includes(normalizedRole)
  );
}

function getPrintersForRoles(restaurant = {}, roles = []) {
  const jobs = [];
  const seen = new Set();
  for (const role of roles) {
    for (const printer of getPrintersForRole(restaurant, role)) {
      const signature = `${role}:${printer.key}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      jobs.push({ role, printer });
    }
  }
  return jobs;
}

function findPrinterByKey(restaurant = {}, printerKey) {
  const key = String(printerKey || "").trim();
  const all = [
    ...normalizeRestaurantPrinters(restaurant),
    ...normalizeDiscoveredPrinters(restaurant.printAgentDiscoveredPrinters),
  ];
  return all.find((printer) => printer.key === key) || null;
}

function hasEnabledPrinters(restaurant = {}) {
  return getEnabledPrinters(restaurant).length > 0;
}

function hasPrintersForRole(restaurant = {}, role) {
  return getPrintersForRole(restaurant, role).length > 0;
}

function validateConnection(connection = {}) {
  if (!connectionIsComplete(connection)) {
    if (connection.type === "tcp") return { ok: false, message: "network_printer_host_required" };
    if (connection.type === "serial") return { ok: false, message: "serial_printer_port_required" };
    return { ok: false, message: "windows_printer_name_required" };
  }
  return { ok: true };
}

function validatePrintersPayload(printers) {
  if (!Array.isArray(printers)) {
    return { ok: false, message: "invalid_printers_payload" };
  }
  if (printers.length > 12) {
    return { ok: false, message: "too_many_printers" };
  }

  const normalized = printers.map((entry, index) => normalizePrinterEntry(entry, index));
  const keys = new Set();
  for (let index = 0; index < normalized.length; index += 1) {
    const printer = normalized[index];
    const raw = printers[index];
    if (keys.has(printer.key)) {
      return { ok: false, message: "duplicate_printer_key" };
    }
    keys.add(printer.key);

    if (!printer.enabled) continue;

    if (Array.isArray(raw.roles) && raw.roles.length === 0) {
      return { ok: false, message: "printer_role_required" };
    }

    if (!printer.roles.length) {
      return { ok: false, message: "printer_role_required" };
    }

    const connectionValidation = validateConnection(printer.connection);
    if (!connectionValidation.ok) {
      return connectionValidation;
    }
  }

  return { ok: true, printers: normalized };
}

function printerTargetSnapshot(printer) {
  if (!printer) return null;
  return {
    key: printer.key,
    name: printer.name,
    roles: printer.roles,
    connection: printer.connection,
    copies: printer.copies,
    connectionType: printer.connectionType,
    host: printer.host,
    port: printer.port,
    serialPort: printer.serialPort,
    windowsPrinterName: printer.windowsPrinterName,
    baudRate: printer.baudRate,
  };
}

function primaryPrinterConfig(restaurant = {}) {
  const printers = normalizeRestaurantPrinters(restaurant);
  const printer = printers[0];
  if (!printer) {
    return {
      connectionType: "network",
      host: "",
      port: 9100,
      serialPort: "",
      windowsPrinterName: "",
      copies: 1,
      enabled: false,
    };
  }

  return {
    connectionType: printer.connectionType || "network",
    host: printer.host || "",
    port: Number.isFinite(Number(printer.port)) ? Number(printer.port) : 9100,
    serialPort: printer.serialPort || "",
    windowsPrinterName: printer.windowsPrinterName || "",
    copies: printer.copies || 1,
    enabled: printer.enabled !== false,
  };
}

function printersForStorage(printers = []) {
  return printers.map((printer) => {
    const connection =
      printer.connection?.type === "serial"
        ? {
            type: "serial",
            host: "",
            port: String(printer.connection.port || printer.serialPort || ""),
            baudRate: Number(printer.connection.baudRate || 9600) || 9600,
            printerName: "",
          }
        : printer.connection?.type === "windows"
          ? {
              type: "windows",
              host: "",
              port: 9100,
              baudRate: 9600,
              printerName: String(printer.connection.printerName || printer.windowsPrinterName || ""),
            }
          : {
              type: "tcp",
              host: String(printer.connection?.host || printer.host || ""),
              port: Number(printer.connection?.port || printer.port || 9100) || 9100,
              baudRate: 9600,
              printerName: "",
            };

    return {
      key: printer.key,
      name: printer.name,
      enabled: printer.enabled !== false,
      roles: printer.roles || ["KITCHEN"],
      connection,
      connectionType: connection.type === "tcp" ? "network" : "bluetooth",
      host: connection.type === "tcp" ? connection.host : "",
      port: connection.type === "tcp" ? connection.port : 9100,
      serialPort: connection.type === "serial" ? String(connection.port || "") : "",
      windowsPrinterName: connection.type === "windows" ? connection.printerName : "",
      baudRate: connection.baudRate || 9600,
      copies: printer.copies || 1,
    };
  });
}

function resolvePrintRolesOnAccept(restaurant = {}) {
  const settings = restaurant.orderSettings || {};
  const configured = Array.isArray(settings.printRolesOnAccept)
    ? settings.printRolesOnAccept
    : ["KITCHEN"];
  return normalizePrintRoles(configured).filter((role) => hasPrintersForRole(restaurant, role));
}

module.exports = {
  PRINT_ROLES,
  printerEntrySchema,
  createPrinterKey,
  normalizePrintRoles,
  normalizeConnection,
  normalizePrinterEntry,
  normalizeRestaurantPrinters,
  normalizeDiscoveredPrinters,
  getEnabledPrinters,
  getDiscoveredEnabledPrinters,
  getPrintersForRole,
  getPrintersForRoles,
  findPrinterByKey,
  hasEnabledPrinters,
  hasPrintersForRole,
  validatePrintersPayload,
  printerTargetSnapshot,
  primaryPrinterConfig,
  printersForStorage,
  resolvePrintRolesOnAccept,
  connectionIsComplete,
};
