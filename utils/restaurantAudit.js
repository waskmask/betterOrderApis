const MAX_EDIT_AUDIT_LOGS = 500;

function serializeAuditValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return value
      .map((item) => (item == null ? "" : String(item)))
      .filter(Boolean)
      .join(", ");
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function valuesEqual(a, b) {
  return serializeAuditValue(a) === serializeAuditValue(b);
}

function diffChange(field, from, to) {
  if (valuesEqual(from, to)) return null;
  return {
    field,
    from: serializeAuditValue(from),
    to: serializeAuditValue(to),
  };
}

function actorSnapshot(user) {
  if (!user) {
    return { userName: "", userEmail: "" };
  }
  const userName =
    user.name ||
    user.restaurant_name ||
    user.username ||
    user.email ||
    "";
  return {
    userName: String(userName || "").trim(),
    userEmail: String(user.email || "").trim().toLowerCase(),
  };
}

/**
 * Append a rich audit entry (+ legacy updated_by). Mutates restaurant doc.
 */
function appendRestaurantAudit(restaurant, user, { action = "other", changes = [] } = {}) {
  const list = Array.isArray(changes) ? changes.filter(Boolean) : [];
  const actor = actorSnapshot(user);
  const entry = {
    userType: user?.role || "admin",
    userId: user?._id,
    userName: actor.userName,
    userEmail: actor.userEmail,
    action,
    changes: list,
    timestamp: new Date(),
  };

  if (!restaurant.edit_audit_logs) restaurant.edit_audit_logs = [];
  restaurant.edit_audit_logs.push(entry);
  if (restaurant.edit_audit_logs.length > MAX_EDIT_AUDIT_LOGS) {
    restaurant.edit_audit_logs = restaurant.edit_audit_logs.slice(
      -MAX_EDIT_AUDIT_LOGS
    );
  }

  if (!restaurant.updated_by) restaurant.updated_by = [];
  restaurant.updated_by = restaurant.updated_by.slice(-19);
  restaurant.updated_by.push({
    userType: entry.userType,
    userId: entry.userId,
    timestamp: entry.timestamp,
  });

  return entry;
}

function sortAuditLogsNewestFirst(logs = []) {
  return [...logs].sort((a, b) => {
    const ta = new Date(a.timestamp || 0).getTime();
    const tb = new Date(b.timestamp || 0).getTime();
    if (tb !== ta) return tb - ta;
    const ida = String(a._id || "");
    const idb = String(b._id || "");
    return idb.localeCompare(ida);
  });
}

function paginateAuditLogs(logs, { cursor, limit = 20 } = {}) {
  const sorted = sortAuditLogsNewestFirst(logs);
  let start = 0;
  if (cursor) {
    const idx = sorted.findIndex((log) => String(log._id) === String(cursor));
    start = idx >= 0 ? idx + 1 : 0;
  }
  const page = sorted.slice(start, start + limit);
  const hasMore = start + page.length < sorted.length;
  const nextCursor =
    hasMore && page.length > 0 ? String(page[page.length - 1]._id) : null;

  return {
    logs: page,
    nextCursor,
    hasMore,
    total: sorted.length,
  };
}

function auditLogsToCsv(logs, restaurantName = "") {
  const escape = (value) => {
    const text = String(value ?? "");
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const header = [
    "timestamp",
    "action",
    "user_name",
    "user_email",
    "user_role",
    "field",
    "from",
    "to",
    "restaurant",
  ];

  const rows = [header.join(",")];
  for (const log of sortAuditLogsNewestFirst(logs)) {
    const base = [
      log.timestamp ? new Date(log.timestamp).toISOString() : "",
      log.action || "",
      log.userName || "",
      log.userEmail || "",
      log.userType || "",
    ];
    const changes =
      Array.isArray(log.changes) && log.changes.length > 0
        ? log.changes
        : [{ field: "", from: "", to: "" }];

    for (const change of changes) {
      rows.push(
        [
          ...base,
          change.field || "",
          change.from || "",
          change.to || "",
          restaurantName,
        ]
          .map(escape)
          .join(",")
      );
    }
  }

  return `\uFEFF${rows.join("\n")}`;
}

module.exports = {
  MAX_EDIT_AUDIT_LOGS,
  serializeAuditValue,
  valuesEqual,
  diffChange,
  actorSnapshot,
  appendRestaurantAudit,
  sortAuditLogsNewestFirst,
  paginateAuditLogs,
  auditLogsToCsv,
};
