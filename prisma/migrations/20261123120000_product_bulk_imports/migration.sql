CREATE TABLE `ProductImportJob` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `storeId` INTEGER NOT NULL,
  `createdByUserId` INTEGER NULL,
  `createdByStaffId` INTEGER NULL,
  `fileName` VARCHAR(191) NOT NULL,
  `fileHash` CHAR(64) NOT NULL,
  `status` ENUM('UPLOADED', 'VALIDATING', 'READY', 'HAS_ERRORS', 'COMMITTING', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'UPLOADED',
  `totalRows` INTEGER NOT NULL DEFAULT 0,
  `validRows` INTEGER NOT NULL DEFAULT 0,
  `invalidRows` INTEGER NOT NULL DEFAULT 0,
  `existingProductRows` INTEGER NOT NULL DEFAULT 0,
  `newProductRows` INTEGER NOT NULL DEFAULT 0,
  `createCount` INTEGER NOT NULL DEFAULT 0,
  `updateCount` INTEGER NOT NULL DEFAULT 0,
  `pendingApprovalCount` INTEGER NOT NULL DEFAULT 0,
  `errorMessage` TEXT NULL,
  `committedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `ProductImportJob_storeId_createdAt_idx`(`storeId`, `createdAt`),
  INDEX `ProductImportJob_status_createdAt_idx`(`status`, `createdAt`),
  INDEX `ProductImportJob_fileHash_idx`(`fileHash`),
  INDEX `ProductImportJob_createdByUserId_createdAt_idx`(`createdByUserId`, `createdAt`),
  INDEX `ProductImportJob_createdByStaffId_createdAt_idx`(`createdByStaffId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProductImportRow` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `importId` INTEGER NOT NULL,
  `sheetName` VARCHAR(191) NOT NULL,
  `rowNumber` INTEGER NOT NULL,
  `rowType` ENUM('EXISTING', 'NEW') NOT NULL,
  `status` ENUM('VALID', 'ERROR', 'PENDING_APPROVAL', 'IMPORTED', 'REJECTED') NOT NULL DEFAULT 'VALID',
  `matchedProductId` INTEGER NULL,
  `productName` VARCHAR(191) NULL,
  `brand` VARCHAR(191) NULL,
  `categoryId` INTEGER NULL,
  `unitType` VARCHAR(191) NULL,
  `unit` VARCHAR(191) NULL,
  `manufacturerBarcode` VARCHAR(191) NULL,
  `description` TEXT NULL,
  `mainImageUrl` TEXT NULL,
  `price` DECIMAL(12, 2) NULL,
  `discountType` ENUM('PERCENTAGE', 'FIXED') NULL,
  `discountValue` DECIMAL(12, 2) NULL,
  `discountPrice` DECIMAL(12, 2) NULL,
  `stockQuantity` INTEGER NULL,
  `availability` BOOLEAN NULL,
  `storeSku` VARCHAR(191) NULL,
  `storeBarcode` VARCHAR(191) NULL,
  `errors` JSON NULL,
  `createdProductId` INTEGER NULL,
  `createdStoreProductId` INTEGER NULL,
  `reviewedByStaffId` INTEGER NULL,
  `rejectionReason` TEXT NULL,
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ProductImportRow_importId_sheetName_rowNumber_key`(`importId`, `sheetName`, `rowNumber`),
  INDEX `ProductImportRow_importId_status_idx`(`importId`, `status`),
  INDEX `ProductImportRow_matchedProductId_idx`(`matchedProductId`),
  INDEX `ProductImportRow_manufacturerBarcode_idx`(`manufacturerBarcode`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ProductImportJob`
  ADD CONSTRAINT `ProductImportJob_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ProductImportJob_createdByUserId_fkey`
  FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `ProductImportJob_createdByStaffId_fkey`
  FOREIGN KEY (`createdByStaffId`) REFERENCES `StaffUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ProductImportRow`
  ADD CONSTRAINT `ProductImportRow_importId_fkey`
  FOREIGN KEY (`importId`) REFERENCES `ProductImportJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Production deployments do not run the development seed, so install the
-- permission and grant it to existing vendor and superadmin roles here.
INSERT INTO `Permission` (`key`, `description`)
VALUES (
  'products.bulk.import',
  'Generate, validate, review, and commit bulk product imports.'
)
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT role_record.`id`, permission_record.`id`
FROM `Role` AS role_record
JOIN `Permission` AS permission_record
  ON permission_record.`key` = 'products.bulk.import'
WHERE role_record.`name` IN ('VENDOR', 'SUPER_ADMIN');
