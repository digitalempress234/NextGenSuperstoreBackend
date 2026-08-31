# Database Schema

## 1. Design Principles
The schema evolves the supplied legacy Prisma design. Existing marketplace concepts are retained where useful, while product comparison and rider onboarding are normalized.

Database: MySQL
ORM: Prisma

## 2. Identity and RBAC

### User
```text
id
firstName
lastName
email (unique)
passwordHash
phoneNumber
avatar
dateOfBirth
isEmailVerified
isActive
status
createdAt
updatedAt
```

### Role
```text
id
name (unique)
description
```

### Permission
```text
id
key (unique)
description
```

### UserRole
Unique `(userId, roleId)`.

### RolePermission
Unique `(roleId, permissionId)`.

## 3. Marketplace

### Category
Supports hierarchy through `parentId`.

### Product
Canonical product:
```text
id
name
barcode
brand
description
categoryId
unit
status
createdAt
updatedAt
```

### Store
```text
id
ownerUserId
name
description
phone
email
state
city
address
latitude
longitude
status
createdAt
updatedAt
```

### StoreUser
Allows multiple staff/users per store.

### StoreProduct
```text
id
storeId
productId
sku
price DECIMAL
discountPrice DECIMAL
discountType
stockQuantity
availabilityStatus
isActive
createdAt
updatedAt
```

Unique recommendation: `(storeId, productId, sku)` or a business-appropriate equivalent.

## 4. Customer Commerce

### Cart
One active cart per customer unless business requirements introduce saved carts.

### CartItem
```text
cartId
storeProductId
quantity
unitPriceSnapshot
```

### CheckoutPaymentGroup
Represents one customer payment attempt/checkout.

### CheckoutPaymentAllocation
Maps payment-group amount to each generated order.

### Order
```text
id
orderNumber (unique)
userId
storeId
fulfillmentType
currentStatus
currency
subtotal
shippingFee
taxAmount
total
customerNameSnapshot
customerEmailSnapshot
customerPhoneSnapshot
deliveryAddressSnapshot
createdAt
updatedAt
```

### OrderItem
Snapshot:
```text
orderId
storeProductId
productId
productName
productCode
productImage
quantity
unitPrice
totalPrice
```

### OrderStatusHistory
Append-only status history:
```text
orderId
fromStatus
toStatus
changedByUserId
reason
createdAt
```

## 5. Payments
### Payment
```text
id
provider
transactionRef (unique)
providerReference
amount
currency
status
paymentMethod
paidAt
failureReason
metadata JSON
createdAt
updatedAt
```

### PaymentWebhookEvent
Stores provider event identity and processing status for idempotency.

## 6. Pickup
### Pickup
```text
id
orderId (unique)
codeHash
qrToken
status
preparedByUserId
verifiedByUserId
preparedAt
collectedAt
expiresAt
```

Do not store a sensitive verification code in plaintext when a hash is sufficient.

## 7. Rider and KYC

### RiderProfile
```text
id
userId (unique)
areaOfOperation
emergencyContactName
emergencyContactPhone
nextOfKinName
nextOfKinPhone
onboardingStatus
isOnline
```

### RiderIdentityDocument
```text
id
riderId
documentType
documentNumberEncryptedOrProtected
cloudinaryPublicId
status
expiryDate
reviewedBy
reviewedAt
rejectionReason
```

### RiderLivenessVerification
```text
id
riderId
provider
reference
status
confidenceScore
selfiePublicId
verifiedAt
```

### RiderLicence
```text
id
riderId
type
numberProtected
issueDate
expiryDate
documentId
status
```

### Vehicle
```text
id
riderId
type
make
model
year
color
plateNumber
registrationNumber
ownershipType
status
```

### VehicleDocument
Registration, ownership/permission, licence, insurance, roadworthiness and inspection documents.

### RiderBankAccount
```text
id
riderId
bankCode
bankName
accountNumberProtected
accountName
verificationStatus
isPrimary
```

### Guarantor
```text
id
riderId
fullName
phone
relationship
address
photographPublicId
status
```

### GuarantorDocument
Identity document metadata and review status.

## 8. Delivery
### Delivery
```text
id
orderId (unique)
riderId nullable
status
pickupCodeHash
deliveryCodeHash
deliveryAddressSnapshot
assignedAt
pickedUpAt
deliveredAt
```

### DeliveryOffer
Supports offering a delivery to one or more eligible riders.

### DeliveryStatusUpdate
Append-only delivery timeline.

## 9. Supporting Modules
- Address
- WishlistItem
- CompareList / CompareItem
- Review
- Notification
- ChatConversation
- ChatMessage
- Wallet
- WalletTransaction
- Withdrawal
- AuditLog

## 10. Important Indexes
Index:
- `StoreProduct(productId, price)`
- `StoreProduct(storeId, isActive)`
- `Order(userId, createdAt)`
- `Order(storeId, createdAt)`
- `Order(currentStatus, createdAt)`
- `Delivery(riderId, status)`
- `Notification(recipientId, isRead, createdAt)`
- document expiry dates;
- webhook event IDs;
- commonly filtered onboarding states.

## 11. Migration Strategy from Old Schema
1. Introduce RBAC tables while preserving legacy role temporarily.
2. Create canonical Product + StoreProduct structure.
3. Backfill each legacy Product into Product and StoreProduct.
4. Migrate CartItem and OrderItem references.
5. Expand RiderProfile without deleting legacy data.
6. Create Vehicle, VehicleDocument, Guarantor and verification tables.
7. Add status-history and webhook-event tables.
8. Remove deprecated columns only after verification and a controlled release.


## Social authentication
`OAuthAccount` stores the verified Google account subject mapping. Google tokens are not stored. The canonical `User` remains the identity used by customer, vendor/store and rider flows.
