-- Add an explicit marketing preference category so customers can opt out.
ALTER TABLE `Notification`
  MODIFY `type` ENUM(
    'ORDER_PLACED',
    'ORDER_STATUS_UPDATE',
    'ORDER_CANCELLED',
    'PAYMENT_RECEIVED',
    'PAYMENT_FAILED',
    'VENDOR_APPROVED',
    'VENDOR_REJECTED',
    'NEW_REVIEW',
    'PRODUCT_OUT_OF_STOCK',
    'DELIVERY_ASSIGNED',
    'DELIVERY_COMPLETED',
    'DELIVERY_CODE',
    'KYC_UPDATE',
    'SYSTEM_ANNOUNCEMENT',
    'CHAT_MESSAGE',
    'DELIVERY_AVAILABLE',
    'SUPPORT_REPLY',
    'REWARD_UPDATE',
    'MARKETING'
  ) NOT NULL;

ALTER TABLE `NotificationPreference`
  MODIFY `type` ENUM(
    'ORDER_PLACED',
    'ORDER_STATUS_UPDATE',
    'ORDER_CANCELLED',
    'PAYMENT_RECEIVED',
    'PAYMENT_FAILED',
    'VENDOR_APPROVED',
    'VENDOR_REJECTED',
    'NEW_REVIEW',
    'PRODUCT_OUT_OF_STOCK',
    'DELIVERY_ASSIGNED',
    'DELIVERY_COMPLETED',
    'DELIVERY_CODE',
    'KYC_UPDATE',
    'SYSTEM_ANNOUNCEMENT',
    'CHAT_MESSAGE',
    'DELIVERY_AVAILABLE',
    'SUPPORT_REPLY',
    'REWARD_UPDATE',
    'MARKETING'
  ) NOT NULL;

CREATE TABLE `PushCampaign` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(191) NOT NULL,
  `message` TEXT NOT NULL,
  `imageUrl` TEXT NULL,
  `deepLink` TEXT NULL,
  `audienceType` ENUM('ALL_USERS', 'CUSTOMERS', 'RIDERS', 'VENDORS', 'SELECTED_USERS') NOT NULL,
  `audienceFilter` JSON NULL,
  `includeInApp` BOOLEAN NOT NULL DEFAULT true,
  `status` ENUM('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'DRAFT',
  `scheduledAt` DATETIME(3) NULL,
  `startedAt` DATETIME(3) NULL,
  `sentAt` DATETIME(3) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `totalRecipients` INTEGER NOT NULL DEFAULT 0,
  `deliveredCount` INTEGER NOT NULL DEFAULT 0,
  `failedCount` INTEGER NOT NULL DEFAULT 0,
  `skippedCount` INTEGER NOT NULL DEFAULT 0,
  `lastError` TEXT NULL,
  `createdById` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `PushCampaign_status_scheduledAt_idx`(`status`, `scheduledAt`),
  INDEX `PushCampaign_createdById_createdAt_idx`(`createdById`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PushCampaignDelivery` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `campaignId` INTEGER NOT NULL,
  `userId` INTEGER NOT NULL,
  `status` ENUM('PENDING', 'DELIVERED', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
  `pushAttempted` INTEGER NOT NULL DEFAULT 0,
  `pushSuccessful` INTEGER NOT NULL DEFAULT 0,
  `pushFailed` INTEGER NOT NULL DEFAULT 0,
  `errorMessage` TEXT NULL,
  `attemptedAt` DATETIME(3) NULL,
  `deliveredAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `PushCampaignDelivery_campaignId_userId_key`(`campaignId`, `userId`),
  INDEX `PushCampaignDelivery_campaignId_status_idx`(`campaignId`, `status`),
  INDEX `PushCampaignDelivery_userId_createdAt_idx`(`userId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PushCampaign`
  ADD CONSTRAINT `PushCampaign_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `StaffUser`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PushCampaignDelivery`
  ADD CONSTRAINT `PushCampaignDelivery_campaignId_fkey`
  FOREIGN KEY (`campaignId`) REFERENCES `PushCampaign`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PushCampaignDelivery`
  ADD CONSTRAINT `PushCampaignDelivery_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
