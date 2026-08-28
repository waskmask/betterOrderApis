# BetterOrder Mobile API

This document is the memory map for the restaurant mobile app.

## Recommended Architecture

- Mongo/API remains the source of truth for orders, prices, restaurant status, menu item availability, and delivery rules.
- Server-Sent Events (`/api/orders/stream`) stays the live foreground channel for web dashboards.
- Firebase Cloud Messaging is used only for push notifications when the mobile app is backgrounded or closed.
- A push notification should wake the app, then the app should fetch the order from the API.

## Firebase Credentials Needed

From Firebase Console:

- Firebase project ID
- Service account client email
- Service account private key
- Android app config file: `google-services.json`
- iOS app config file: `GoogleService-Info.plist`
- For iOS push: APNs key configured in Firebase, including Apple Team ID, Key ID, and Bundle ID

API environment variables:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Alternative single JSON env:

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"project_id":"...","client_email":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"}
```

The API code is defensive: if `firebase-admin` or the credentials are missing, checkout still works and push is skipped.

Install dependency in `api` before enabling real push:

```bash
npm install firebase-admin
```

## Web Dashboard Push Config

The restaurant web dashboard (`admin-next-v1`) also needs Firebase **Web App** config values.
These are not the same as `google-services.json`. Create or open a Web App in Firebase Console and copy its config.

Add these to `admin-next-v1/.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=betterorder-web.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=betterorder-web
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=betterorder-web.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=903859932268
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_VAPID_KEY=...
```

Where to find `NEXT_PUBLIC_FIREBASE_VAPID_KEY`:

- Firebase Console
- Project settings
- Cloud Messaging
- Web Push certificates
- Generate key pair

The restaurant dashboard registers web push when the restaurant user turns sound on from the orders page.
If these env values are missing, the dashboard still uses in-page sound and SSE while open.

## Mobile Login Flow

1. Restaurant logs in with the existing restaurant auth endpoint.
2. Mobile app stores the token in Keychain/Keystore, not plain local storage.
3. Mobile app asks Firebase for an FCM token.
4. Mobile app registers that FCM token with BetterOrder.
5. Mobile app fetches active orders from `/api/orders`.
6. When a push arrives, open/focus the app and fetch the order by id.

## Auth

Use the restaurant JWT in the header:

```http
Authorization: Bearer <restaurant-jwt>
```

Only restaurant users can use `/api/mobile/*`.

## Endpoints

### Check Mobile Session

```http
GET /api/mobile/me
Authorization: Bearer <restaurant-jwt>
```

Response:

```json
{
  "success": true,
  "restaurant": {
    "_id": "67f6dab0655faf9843288537",
    "name": "Restaurant Zerda",
    "username": "restaurant-zerda",
    "isActive": true,
    "isVisible": true,
    "deliveryEnabled": true,
    "takeawayEnabled": true
  },
  "push": {
    "firebaseConfigured": true
  }
}
```

### Register Device Token

Call this after login, app start, and whenever Firebase rotates the token.

```http
POST /api/mobile/devices
Authorization: Bearer <restaurant-jwt>
Content-Type: application/json
```

Body:

```json
{
  "fcmToken": "firebase-device-token",
  "platform": "android",
  "appVersion": "1.0.0",
  "deviceName": "Pixel 8",
  "locale": "de-DE"
}
```

`platform` can be `android`, `ios`, `web`, or omitted.

Response:

```json
{
  "success": true,
  "device": {
    "_id": "device-document-id",
    "platform": "android",
    "isActive": true,
    "lastSeenAt": "2026-04-28T01:00:00.000Z"
  }
}
```

### Unregister Device Token

Call on logout.

```http
DELETE /api/mobile/devices
Authorization: Bearer <restaurant-jwt>
Content-Type: application/json
```

Body:

```json
{
  "fcmToken": "firebase-device-token"
}
```

Response:

```json
{ "success": true }
```

## Order APIs For Mobile

### List Orders

```http
GET /api/orders?limit=80
Authorization: Bearer <restaurant-jwt>
```

Restaurant users only receive their own restaurant orders.

Useful status filters:

```http
GET /api/orders?status=pending
GET /api/orders?status=accepted
GET /api/orders?status=dispatch
```

### Get Order Detail

```http
GET /api/orders/:orderId
Authorization: Bearer <restaurant-jwt>
```

### Accept Order

```http
PATCH /api/orders/:orderId/accept
Authorization: Bearer <restaurant-jwt>
Content-Type: application/json
```

Body:

```json
{
  "deliveryMinutes": 45,
  "note": ""
}
```

Allowed values: `30`, `45`, `60`, `75`, `90`, `105`, `120`.

### Reject Order

```http
PATCH /api/orders/:orderId/reject
Authorization: Bearer <restaurant-jwt>
Content-Type: application/json
```

Body:

```json
{
  "reason": "Kitchen closed"
}
```

### Move Order Status

```http
PATCH /api/orders/:orderId/status
Authorization: Bearer <restaurant-jwt>
Content-Type: application/json
```

Body:

```json
{
  "status": "dispatch"
}
```

Allowed status moves:

- `accepted` to `preparing`
- `accepted` or `preparing` to `dispatch`
- `dispatch` to `delivered`

## Push Payload

When a new order is created, active restaurant devices receive:

```json
{
  "notification": {
    "title": "New order",
    "body": "BO2026-000001 · Guest customer · €24.80"
  },
  "data": {
    "type": "order.created",
    "orderId": "mongo-order-id",
    "orderNumber": "BO2026-000001",
    "restaurantId": "mongo-restaurant-id",
    "status": "pending"
  }
}
```

The app should not trust prices or status from push data. Always fetch the order from the API.

## Mobile App MVP Scope

Restaurant mobile app should include:

- Login/logout
- Push permission and FCM token registration
- New order alert with sound/vibration
- Pending, preparing, and dispatched order columns
- Accept with delivery time
- Reject with reason
- Dispatch and deliver actions
- Toggle visibility, delivery, and takeaway, using the same API rules as web admin
- Toggle menu item availability for urgent sold-out cases

Full restaurant management, AI site builder, AI posts, menu design, delivery zones, and domain settings should stay in the web app.
