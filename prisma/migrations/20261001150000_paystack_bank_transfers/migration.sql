ALTER TABLE `CheckoutPaymentGroup`
  MODIFY `paymentMethod` ENUM('CARD', 'BANK_TRANSFER', 'OPAY', 'WALLET', 'NEXTGEN_PURSE', 'EASYBUY', 'MAKOPA', 'WALLET_BNPL') NOT NULL DEFAULT 'CARD';

ALTER TABLE `Payment`
  MODIFY `paymentMethod` ENUM('CARD', 'BANK_TRANSFER', 'OPAY', 'WALLET', 'NEXTGEN_PURSE', 'EASYBUY', 'MAKOPA', 'WALLET_BNPL') NOT NULL;

CREATE TABLE `WalletFundingAccount` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `paystackCustomerCode` VARCHAR(191) NULL,
  `paystackCustomerId` INTEGER NULL,
  `providerAccountId` INTEGER NULL,
  `bankName` VARCHAR(191) NULL,
  `bankSlug` VARCHAR(191) NULL,
  `accountName` VARCHAR(191) NULL,
  `accountNumber` VARCHAR(191) NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'NGN',
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `consentedAt` DATETIME(3) NOT NULL,
  `assignedAt` DATETIME(3) NULL,
  `failureReason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `WalletFundingAccount_userId_key`(`userId`),
  UNIQUE INDEX `WalletFundingAccount_paystackCustomerCode_key`(`paystackCustomerCode`),
  UNIQUE INDEX `WalletFundingAccount_providerAccountId_key`(`providerAccountId`),
  UNIQUE INDEX `WalletFundingAccount_accountNumber_key`(`accountNumber`),
  INDEX `WalletFundingAccount_status_createdAt_idx`(`status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `WalletFundingAccount`
  ADD CONSTRAINT `WalletFundingAccount_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
