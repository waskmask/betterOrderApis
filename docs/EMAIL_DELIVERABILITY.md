# Email deliverability (Ionos / BetterOrder)

## DNS records

1. **SPF** — Include Ionos SMTP in your domain SPF record
2. **DKIM** — Enable DKIM signing in Ionos for `betterorder.de`
3. **DMARC** — Start with `p=none`, monitor, then tighten

## SMTP configuration

- `SMTP_FROM` must match an authenticated sender on Ionos (e.g. `hallo@betterorder.de`)
- Use port `587` with STARTTLS (`SMTP_SECURE=true` for requireTLS on 587)
- Set `SUPPORT_EMAIL` for reply-to address

## Application settings

| Variable | Purpose |
|----------|---------|
| `EMAIL_ENABLED` | Kill switch (`false` skips all sends) |
| `EMAIL_PREVIEW_MODE` | Log only, no SMTP (dev) |
| `CUSTOMER_APP_URL` | Links in emails (storefront base URL) |

## Best practices

- Every email includes a plain-text alternative (auto-generated from HTML)
- Transactional emails do not include marketing unsubscribe links
- User-generated content is HTML-escaped before insertion
- Failed sends are logged in `EmailDeliveryLog` and visible in admin

## Monitoring

- Check admin **Reviews → Failed emails** for delivery failures
- Review Ionos bounce reports weekly after launch
