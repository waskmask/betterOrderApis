# Email template keys reference

All templates support global keys: `{{brandName}}`, `{{logoUrl}}`, `{{homeUrl}}`, `{{supportEmail}}`, `{{year}}`, `{{lang}}`.

## Auth templates

| Key | Templates |
|-----|-----------|
| `{{name}}` | welcome, verify-email, forgot-password, reset-success, google-signup |
| `{{actionUrl}}` | verify-email, forgot-password |

## Order templates (customer)

| Key | Description |
|-----|-------------|
| `{{orderNumber}}` | Order number e.g. BO2604 |
| `{{restaurantName}}` | Restaurant name snapshot |
| `{{customerName}}` | Customer full name |
| `{{fulfillmentMode}}` | Delivery / Take-away (localized) |
| `{{requestedTime}}` | ASAP or scheduled time |
| `{{acceptedEta}}` | ETA after accept (optional) |
| `{{deliveryAddress}}` | Formatted address HTML |
| `{{orderLinesHtml}}` | Pre-rendered line items table |
| `{{totalsHtml}}` | Pre-rendered totals block |
| `{{paymentMethod}}` | Localized payment method |
| `{{paymentStatus}}` | Localized payment status |
| `{{rejectReason}}` | Rejection reason (rejected template) |
| `{{trackOrderUrl}}` | Public order tracking URL |
| `{{orderTotal}}` | Formatted total |

## Order templates (restaurant)

Same as customer plus: `{{customerPhone}}`, `{{customerEmail}}`, `{{adminOrderUrl}}`.

## Review invite

| Key | Description |
|-----|-------------|
| `{{name}}` | Customer first name |
| `{{restaurantName}}` | Restaurant name |
| `{{orderNumber}}` | Order number |
| `{{reviewUrl}}` | Magic review link |
| `{{expiresAt}}` | Human-readable expiry |

## Adding a language

1. Copy `*-en.html` files to `*-xx.html` in the same folder
2. Translate visible text only — keep `{{keys}}` unchanged
3. Add subjects in `api/services/email/emailTemplateRegistry.js`
4. Add `xx` to `SUPPORTED_LANGS`
