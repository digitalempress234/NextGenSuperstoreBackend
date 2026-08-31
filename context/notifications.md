# Notifications and Email

## Channels

Purse supports two user-facing notification channels:

1. In-app notifications stored in MySQL.
2. Transactional email delivered through Nodemailer/SMTP.

The user's notification preferences independently control each channel. By default both channels are enabled.

## In-app API

```http
GET /purse/v1/notifications?page=1&limit=20&unreadOnly=false
GET /purse/v1/notifications/unread-count
PATCH /purse/v1/notifications/:id/read
PATCH /purse/v1/notifications/read-all
GET /purse/v1/notifications/preferences
PATCH /purse/v1/notifications/preferences
```

### Example

```json
{
  "items": [
    {
      "id": 42,
      "title": "Payment received",
      "message": "Payment for PUR-172459 received.",
      "type": "PAYMENT_RECEIVED",
      "priority": "MEDIUM",
      "isRead": false,
      "readAt": null,
      "data": {
        "paymentId": 8,
        "reference": "PUR-8-8c2b9d"
      },
      "createdAt": "2026-08-25T18:30:00.000Z",
      "updatedAt": "2026-08-25T18:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  },
  "unreadCount": 1
}
```

## Email templates

All transactional templates are source-controlled in:

`src/mail/templates/email.templates.ts`

Current templates:

- `orderPlaced`
- `orderStatus`
- `paymentReceived`
- `paymentFailed`
- `deliveryAssigned`
- `deliveryCompleted`
- `kycUpdate`
- `systemAnnouncement`

Each template renders both HTML and plain text. HTML values are escaped before being inserted into the template.

## Email logging

Every attempted email creates an `EmailLog` record containing the recipient, template key, subject, delivery status, provider message ID and error details where applicable.

## Events currently wired

| Event | In-app | Email |
|---|---:|---:|
| Order received | Yes | Yes |
| Order status changed | Yes | Yes |
| Order cancelled | Yes | Yes |
| Payment received | Yes | Yes |
| Payment failed | Yes | Yes |
| Rider assigned | Yes | Yes |
| Delivery completed | Yes | Yes |
| Rider KYC submitted | Yes | Yes |

## Frontend behavior

The frontend does not need a WebSocket to use the notification system. It can poll the unread-count endpoint on app focus and fetch the notification list when the user opens the notification center. The MySQL notification record remains the source of truth.

Authentication remains cookie-only: notification requests use the existing secure HttpOnly cookies and `credentials: include`; no notification token is stored in localStorage or sessionStorage.
