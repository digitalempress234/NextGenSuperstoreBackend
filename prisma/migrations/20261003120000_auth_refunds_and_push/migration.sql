-- Authentication, refund processing, and device notification support.
ALTER TABLE `AdminSession`
  ADD COLUMN `refreshRotatedAt` DATETIME(3) NULL;

ALTER TABLE `NotificationPreference`
  ADD COLUMN `push` BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE `PasskeyCredential` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `credentialId` VARCHAR(191) NOT NULL,
  `publicKey` LONGBLOB NOT NULL,
  `counter` BIGINT NOT NULL DEFAULT 0,
  `transports` JSON NULL,
  `deviceType` VARCHAR(191) NULL,
  `backedUp` BOOLEAN NOT NULL DEFAULT false,
  `label` VARCHAR(191) NULL,
  `lastUsedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `PasskeyCredential_credentialId_key`(`credentialId`),
  INDEX `PasskeyCredential_userId_createdAt_idx`(`userId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `PasskeyCredential_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DeviceRegistration` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `token` VARCHAR(512) NOT NULL,
  `platform` ENUM('ANDROID', 'IOS', 'WEB') NOT NULL,
  `deviceId` VARCHAR(191) NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `DeviceRegistration_token_key`(`token`),
  INDEX `DeviceRegistration_userId_enabled_idx`(`userId`, `enabled`),
  PRIMARY KEY (`id`),
  CONSTRAINT `DeviceRegistration_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Refund` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `orderId` INTEGER NOT NULL,
  `userId` INTEGER NOT NULL,
  `paymentId` INTEGER NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'NGN',
  `provider` ENUM('PAYSTACK', 'MANUAL') NOT NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'NEEDS_ATTENTION', 'MANUAL_REVIEW') NOT NULL DEFAULT 'PENDING',
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `providerRefundId` VARCHAR(191) NULL,
  `reason` VARCHAR(191) NOT NULL,
  `failureReason` VARCHAR(191) NULL,
  `providerPayload` JSON NULL,
  `processingAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Refund_orderId_key`(`orderId`),
  UNIQUE INDEX `Refund_idempotencyKey_key`(`idempotencyKey`),
  UNIQUE INDEX `Refund_providerRefundId_key`(`providerRefundId`),
  INDEX `Refund_status_createdAt_idx`(`status`, `createdAt`),
  INDEX `Refund_userId_createdAt_idx`(`userId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `Refund_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Refund_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Refund_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
