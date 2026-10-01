ALTER TABLE `EmailLog`
  ADD COLUMN `eventKey` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `EmailLog_eventKey_key`(`eventKey`);

ALTER TABLE `Notification`
  ADD COLUMN `eventKey` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `Notification_eventKey_key`(`eventKey`);

CREATE TABLE `OrderConfirmationOutbox` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `orderId` INTEGER NOT NULL,
  `userId` INTEGER NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processingAt` DATETIME(3) NULL,
  `processedAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `OrderConfirmationOutbox_orderId_key`(`orderId`),
  INDEX `OrderConfirmationOutbox_status_availableAt_idx`(`status`, `availableAt`),
  INDEX `OrderConfirmationOutbox_userId_createdAt_idx`(`userId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OrderConfirmationOutbox`
  ADD CONSTRAINT `OrderConfirmationOutbox_orderId_fkey`
  FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `OrderConfirmationOutbox`
  ADD CONSTRAINT `OrderConfirmationOutbox_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
