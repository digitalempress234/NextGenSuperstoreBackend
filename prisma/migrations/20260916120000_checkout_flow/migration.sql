-- AlterTable
ALTER TABLE `Address` ADD COLUMN `additionalInfo` VARCHAR(191) NULL,
    ADD COLUMN `additionalPhone` VARCHAR(191) NULL,
    ADD COLUMN `email` VARCHAR(191) NULL,
    ADD COLUMN `firstName` VARCHAR(191) NULL,
    ADD COLUMN `lastName` VARCHAR(191) NULL,
    ADD COLUMN `phone` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `CheckoutPaymentGroup` ADD COLUMN `activeCartId` INTEGER NULL,
    ADD COLUMN `cartSnapshot` JSON NULL,
    ADD COLUMN `checkoutSnapshot` JSON NULL,
    ADD COLUMN `paymentMethod` ENUM('CARD', 'OPAY', 'WALLET', 'NEXTGEN_PURSE', 'EASYBUY', 'MAKOPA', 'WALLET_BNPL') NOT NULL DEFAULT 'CARD';

-- AlterTable
ALTER TABLE `Payment` MODIFY `paymentMethod` ENUM('CARD', 'OPAY', 'WALLET', 'NEXTGEN_PURSE', 'EASYBUY', 'MAKOPA', 'WALLET_BNPL') NOT NULL;

-- AlterTable
ALTER TABLE `Pickup` ADD COLUMN `stationId` INTEGER NULL,
    ADD COLUMN `stationSnapshot` JSON NULL;

-- CreateTable
CREATE TABLE `PickupStation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BnplPlan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `provider` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `months` INTEGER NOT NULL,
    `interestRate` DECIMAL(6, 2) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BnplApplication` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `cartId` INTEGER NOT NULL,
    `activeCartId` INTEGER NULL,
    `planId` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING_REVIEW',
    `employerName` VARCHAR(191) NOT NULL,
    `monthlyIncome` DECIMAL(12, 2) NOT NULL,
    `accountNumber` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(191) NOT NULL,
    `accountLast4` VARCHAR(191) NOT NULL,
    `documentData` LONGBLOB NOT NULL,
    `documentName` VARCHAR(191) NOT NULL,
    `documentMime` VARCHAR(191) NOT NULL,
    `consentAt` DATETIME(3) NOT NULL,
    `checkoutInput` JSON NOT NULL,
    `quoteSnapshot` JSON NOT NULL,
    `planSnapshot` JSON NOT NULL,
    `paymentGroupId` INTEGER NULL,
    `reviewedById` INTEGER NULL,
    `reviewReason` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BnplApplication_activeCartId_key`(`activeCartId`),
    UNIQUE INDEX `BnplApplication_paymentGroupId_key`(`paymentGroupId`),
    INDEX `BnplApplication_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `BnplApplication_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `CheckoutPaymentGroup_activeCartId_key` ON `CheckoutPaymentGroup`(`activeCartId`);

-- AddForeignKey
ALTER TABLE `BnplApplication` ADD CONSTRAINT `BnplApplication_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `BnplPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
