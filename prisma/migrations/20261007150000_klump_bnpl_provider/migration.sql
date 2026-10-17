ALTER TABLE `CheckoutPaymentGroup`
  MODIFY `paymentMethod` ENUM(
    'CARD','BANK_TRANSFER','OPAY','WALLET','NEXTGEN_PURSE','EASYBUY','MAKOPA','WALLET_BNPL','KLUMP_BNPL'
  ) NOT NULL DEFAULT 'CARD';

ALTER TABLE `Payment`
  MODIFY `paymentMethod` ENUM(
    'CARD','BANK_TRANSFER','OPAY','WALLET','NEXTGEN_PURSE','EASYBUY','MAKOPA','WALLET_BNPL','KLUMP_BNPL'
  ) NOT NULL,
  MODIFY `provider` ENUM('PAYSTACK','MANUAL','KLUMP') NOT NULL;

ALTER TABLE `BnplRepayment`
  MODIFY `method` ENUM(
    'CARD','BANK_TRANSFER','OPAY','WALLET','NEXTGEN_PURSE','EASYBUY','MAKOPA','WALLET_BNPL','KLUMP_BNPL'
  ) NOT NULL;

ALTER TABLE `Refund`
  MODIFY `provider` ENUM('PAYSTACK','MANUAL','KLUMP') NOT NULL;

CREATE TABLE `KlumpTransaction` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `paymentGroupId` INTEGER NOT NULL,
  `paymentId` INTEGER NOT NULL,
  `merchantReference` VARCHAR(191) NOT NULL,
  `providerReference` VARCHAR(191) NULL,
  `status` ENUM('PENDING','INITIATED','ABANDONED','SUCCESSFUL','FAILED') NOT NULL DEFAULT 'PENDING',
  `isLive` BOOLEAN NOT NULL,
  `checkoutPayload` JSON NOT NULL,
  `providerPayload` JSON NULL,
  `verifiedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `KlumpTransaction_paymentGroupId_key`(`paymentGroupId`),
  UNIQUE INDEX `KlumpTransaction_paymentId_key`(`paymentId`),
  UNIQUE INDEX `KlumpTransaction_merchantReference_key`(`merchantReference`),
  UNIQUE INDEX `KlumpTransaction_providerReference_key`(`providerReference`),
  INDEX `KlumpTransaction_userId_createdAt_idx`(`userId`, `createdAt`),
  INDEX `KlumpTransaction_status_updatedAt_idx`(`status`, `updatedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `KlumpTransaction_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `KlumpTransaction_paymentGroupId_fkey`
    FOREIGN KEY (`paymentGroupId`) REFERENCES `CheckoutPaymentGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `KlumpTransaction_paymentId_fkey`
    FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
