let firebaseApp = null;

function parseServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  if (
    !process.env.FIREBASE_PROJECT_ID ||
    !process.env.FIREBASE_CLIENT_EMAIL ||
    !process.env.FIREBASE_PRIVATE_KEY
  ) {
    return null;
  }

  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
}

function getFirebaseAdmin() {
  if (firebaseApp) return firebaseApp;

  let admin;
  try {
    admin = require("firebase-admin");
  } catch (error) {
    return null;
  }

  const serviceAccount = parseServiceAccount();
  if (!serviceAccount) return null;

  firebaseApp =
    admin.apps?.length > 0
      ? admin
      : admin.initializeApp({
          credential: admin.cert(serviceAccount),
        }) && admin;

  return firebaseApp;
}

function isFirebaseConfigured() {
  return Boolean(parseServiceAccount());
}

function isInvalidTokenError(error) {
  return [
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered",
    "messaging/invalid-argument",
  ].includes(error?.code);
}

async function sendPushToTokens(tokens, message) {
  const uniqueTokens = [...new Set((tokens || []).filter(Boolean))];
  if (!uniqueTokens.length) {
    return { sent: 0, failed: 0, invalidTokens: [], skipped: true };
  }

  const admin = getFirebaseAdmin();
  if (!admin) {
    console.warn("Firebase messaging skipped: firebase-admin or credentials are not configured.");
    return { sent: 0, failed: 0, invalidTokens: [], skipped: true };
  }

  const response = await admin.messaging().sendEachForMulticast({
    tokens: uniqueTokens,
    notification: message.notification,
    data: message.data || {},
    android: {
      priority: "high",
      notification: {
        channelId: "orders",
        sound: "default",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
        },
      },
    },
  });

  const invalidTokens = response.responses
    .map((result, index) => (result.success ? null : { result, token: uniqueTokens[index] }))
    .filter((entry) => entry && isInvalidTokenError(entry.result.error))
    .map((entry) => entry.token);

  return {
    sent: response.successCount,
    failed: response.failureCount,
    invalidTokens,
    skipped: false,
  };
}

module.exports = {
  isFirebaseConfigured,
  sendPushToTokens,
};
