const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeRestaurantPrinters,
  getEnabledPrinters,
  getPrintersForRole,
  getPrintersForRoles,
  validatePrintersPayload,
  resolvePrintRolesOnAccept,
} = require("../services/printerConfigService");
const { printJobIdempotencyKey } = require("../services/orderPrintService");

test("legacy single printerConfig migrates with KITCHEN role", () => {
  const printers = normalizeRestaurantPrinters({
    printerConfig: {
      enabled: true,
      connectionType: "network",
      host: "192.168.1.50",
      port: 9100,
    },
  });
  assert.equal(printers.length, 1);
  assert.equal(printers[0].connection.type, "tcp");
  assert.equal(printers[0].connection.host, "192.168.1.50");
  assert.deepEqual(printers[0].roles, ["KITCHEN"]);
});

test("role routing returns only matching printers", () => {
  const restaurant = {
    printers: [
      {
        key: "kitchen",
        name: "Kitchen",
        enabled: true,
        roles: ["KITCHEN"],
        connection: { type: "tcp", host: "10.0.0.8", port: 9100 },
      },
      {
        key: "cash",
        name: "Cash",
        enabled: true,
        roles: ["RECEIPT", "KITCHEN"],
        connection: { type: "serial", port: "COM3", baudRate: 9600 },
      },
      {
        key: "bar",
        name: "Bar",
        enabled: true,
        roles: ["BAR"],
        connection: { type: "tcp", host: "10.0.0.9", port: 9100 },
      },
    ],
  };

  assert.equal(getPrintersForRole(restaurant, "KITCHEN").length, 2);
  assert.equal(getPrintersForRole(restaurant, "RECEIPT").length, 1);
  assert.equal(getPrintersForRole(restaurant, "BAR").length, 1);
  assert.equal(getPrintersForRoles(restaurant, ["KITCHEN", "RECEIPT"]).length, 3);
});

test("serial printer stores COM on serialPort not numeric port", () => {
  const result = validatePrintersPayload([
    {
      key: "bt",
      name: "Bluetooth",
      enabled: true,
      roles: ["KITCHEN"],
      connection: { type: "serial", port: "COM3", baudRate: 9600 },
    },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.printers[0].serialPort, "COM3");
  assert.equal(result.printers[0].port, 9100);
  assert.equal(result.printers[0].connection.port, "COM3");

  const { primaryPrinterConfig, printersForStorage } = require("../services/printerConfigService");
  const legacy = primaryPrinterConfig({ printers: result.printers });
  assert.equal(legacy.serialPort, "COM3");
  assert.equal(legacy.port, 9100);
  assert.equal(typeof legacy.port, "number");

  const stored = printersForStorage(result.printers);
  assert.equal(stored[0].serialPort, "COM3");
  assert.equal(stored[0].port, 9100);
  assert.equal(stored[0].connection.port, "COM3");
});

test("rejects enabled printer without roles", () => {
  const result = validatePrintersPayload([
    {
      key: "bad",
      name: "Bad",
      enabled: true,
      roles: [],
      connection: { type: "serial", port: "COM3" },
    },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.message, "printer_role_required");
});

test("rejects enabled tcp printer without host", () => {
  const result = validatePrintersPayload([
    {
      key: "net",
      name: "WiFi",
      enabled: true,
      roles: ["KITCHEN"],
      connection: { type: "tcp", port: 9100 },
    },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.message, "network_printer_host_required");
});

test("accept idempotency key includes role and printer", () => {
  assert.equal(
    printJobIdempotencyKey("order1", "accept", "printer_a", "KITCHEN"),
    "accept:order1:KITCHEN:printer_a"
  );
});

test("resolvePrintRolesOnAccept skips roles with no printer", () => {
  const roles = resolvePrintRolesOnAccept({
    orderSettings: { printRolesOnAccept: ["KITCHEN", "BAR"] },
    printers: [
      {
        key: "k",
        enabled: true,
        roles: ["KITCHEN"],
        connection: { type: "tcp", host: "10.0.0.1", port: 9100 },
      },
    ],
  });
  assert.deepEqual(roles, ["KITCHEN"]);
});
