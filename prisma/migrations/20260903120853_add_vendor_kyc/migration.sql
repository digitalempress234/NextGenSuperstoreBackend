-- AlterTable
ALTER TABLE `GuarantorDocument` ADD COLUMN `qoreidRaw` JSON NULL,
    ADD COLUMN `qoreidReference` VARCHAR(191) NULL,
    ADD COLUMN `qoreidStatus` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `RiderDocument` ADD COLUMN `faceMatchScore` DECIMAL(5, 2) NULL,
    ADD COLUMN `qoreidRaw` JSON NULL,
    ADD COLUMN `qoreidReference` VARCHAR(191) NULL,
    ADD COLUMN `qoreidStatus` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `VendorProfile` ADD COLUMN `onboardingStatus` ENUM('CREATED', 'PROFILE_COMPLETED', 'NIN_VERIFIED', 'CAC_VERIFIED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED') NOT NULL DEFAULT 'CREATED';

-- AlterTable
ALTER TABLE `Withdrawal` ADD COLUMN `mode` VARCHAR(191) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN `rejectionReason` VARCHAR(191) NULL,
    ADD COLUMN `reviewedAt` DATETIME(3) NULL,
    ADD COLUMN `reviewedById` INTEGER NULL;

-- CreateTable
CREATE TABLE `VendorNinVerification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vendorProfileId` INTEGER NOT NULL,
    `ninNumber` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `qoreidReference` VARCHAR(191) NULL,
    `qoreidStatus` VARCHAR(191) NULL,
    `qoreidRaw` JSON NULL,
    `faceMatchScore` DECIMAL(5, 2) NULL,
    `rejectionReason` VARCHAR(191) NULL,
    `reviewedById` INTEGER NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VendorNinVerification_vendorProfileId_key`(`vendorProfileId`),
    INDEX `VendorNinVerification_vendorProfileId_status_idx`(`vendorProfileId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VendorCacVerification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vendorProfileId` INTEGER NOT NULL,
    `regNumber` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `qoreidReference` VARCHAR(191) NULL,
    `qoreidStatus` VARCHAR(191) NULL,
    `qoreidRaw` JSON NULL,
    `companyName` VARCHAR(191) NULL,
    `companyType` VARCHAR(191) NULL,
    `incorporatedAt` DATETIME(3) NULL,
    `tinVerified` BOOLEAN NOT NULL DEFAULT false,
    `tinQoreidRaw` JSON NULL,
    `rejectionReason` VARCHAR(191) NULL,
    `reviewedById` INTEGER NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VendorCacVerification_vendorProfileId_key`(`vendorProfileId`),
    INDEX `VendorCacVerification_vendorProfileId_status_idx`(`vendorProfileId`, `status`),
    INDEX `VendorCacVerification_regNumber_idx`(`regNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreImage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeId` INTEGER NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `publicId` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StoreImage_storeId_sortOrder_idx`(`storeId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreCacVerification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeId` INTEGER NOT NULL,
    `regNumber` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `qoreidReference` VARCHAR(191) NULL,
    `qoreidStatus` VARCHAR(191) NULL,
    `qoreidRaw` JSON NULL,
    `companyName` VARCHAR(191) NULL,
    `companyType` VARCHAR(191) NULL,
    `incorporatedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(191) NULL,
    `reviewedById` INTEGER NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StoreCacVerification_storeId_status_idx`(`storeId`, `status`),
    INDEX `StoreCacVerification_regNumber_idx`(`regNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlatformConfig` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedById` INTEGER NULL,

    UNIQUE INDEX `PlatformConfig_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreWallet` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeId` INTEGER NOT NULL,
    `balance` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `lockedBalance` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StoreWallet_storeId_key`(`storeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreWalletTransaction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `walletId` INTEGER NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `type` ENUM('CREDIT', 'DEBIT', 'HOLD', 'RELEASE', 'ADJUSTMENT') NOT NULL,
    `description` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NULL,
    `orderId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StoreWalletTransaction_reference_key`(`reference`),
    INDEX `StoreWalletTransaction_walletId_createdAt_idx`(`walletId`, `createdAt`),
    INDEX `StoreWalletTransaction_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreWithdrawal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeId` INTEGER NOT NULL,
    `walletId` INTEGER NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `mode` VARCHAR(191) NOT NULL DEFAULT 'MANUAL',
    `bankName` VARCHAR(191) NOT NULL,
    `accountNumber` VARCHAR(191) NOT NULL,
    `accountName` VARCHAR(191) NOT NULL,
    `providerRef` VARCHAR(191) NULL,
    `rejectionReason` VARCHAR(191) NULL,
    `reviewedById` INTEGER NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StoreWithdrawal_storeId_status_createdAt_idx`(`storeId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RiderEarning` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `riderId` INTEGER NOT NULL,
    `deliveryId` INTEGER NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'HELD',
    `releasedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RiderEarning_deliveryId_key`(`deliveryId`),
    INDEX `RiderEarning_riderId_status_idx`(`riderId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VendorNinVerification` ADD CONSTRAINT `VendorNinVerification_vendorProfileId_fkey` FOREIGN KEY (`vendorProfileId`) REFERENCES `VendorProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VendorCacVerification` ADD CONSTRAINT `VendorCacVerification_vendorProfileId_fkey` FOREIGN KEY (`vendorProfileId`) REFERENCES `VendorProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreImage` ADD CONSTRAINT `StoreImage_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreCacVerification` ADD CONSTRAINT `StoreCacVerification_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreWallet` ADD CONSTRAINT `StoreWallet_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreWalletTransaction` ADD CONSTRAINT `StoreWalletTransaction_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `StoreWallet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreWithdrawal` ADD CONSTRAINT `StoreWithdrawal_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreWithdrawal` ADD CONSTRAINT `StoreWithdrawal_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `StoreWallet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RiderEarning` ADD CONSTRAINT `RiderEarning_riderId_fkey` FOREIGN KEY (`riderId`) REFERENCES `RiderProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RiderEarning` ADD CONSTRAINT `RiderEarning_deliveryId_fkey` FOREIGN KEY (`deliveryId`) REFERENCES `Delivery`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
