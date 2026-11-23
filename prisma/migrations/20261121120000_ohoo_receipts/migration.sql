CREATE TABLE `Receipt` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `receiptNumber` VARCHAR(191) NOT NULL,
  `userId` INTEGER NOT NULL,
  `paymentGroupId` INTEGER NOT NULL,
  `paymentId` INTEGER NOT NULL,
  `status` ENUM('ISSUED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED') NOT NULL DEFAULT 'ISSUED',
  `currency` VARCHAR(191) NOT NULL DEFAULT 'NGN',
  `subtotal` DECIMAL(12, 2) NOT NULL,
  `shippingFee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `taxAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `discountAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `totalAmount` DECIMAL(12, 2) NOT NULL,
  `paymentMethod` VARCHAR(32) NOT NULL,
  `paymentReference` VARCHAR(191) NOT NULL,
  `snapshot` JSON NOT NULL,
  `paidAt` DATETIME(3) NOT NULL,
  `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `Receipt_receiptNumber_key`(`receiptNumber`),
  UNIQUE INDEX `Receipt_paymentGroupId_key`(`paymentGroupId`),
  INDEX `Receipt_userId_issuedAt_idx`(`userId`, `issuedAt`),
  INDEX `Receipt_paymentId_idx`(`paymentId`),
  INDEX `Receipt_status_issuedAt_idx`(`status`, `issuedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Receipt`
  ADD CONSTRAINT `Receipt_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Receipt_paymentGroupId_fkey`
  FOREIGN KEY (`paymentGroupId`) REFERENCES `CheckoutPaymentGroup`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Receipt_paymentId_fkey`
  FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
