ALTER TABLE `StoreProduct` ADD COLUMN `barcode` VARCHAR(191) NULL,
  ADD COLUMN `barcodeFormat` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `StoreProduct_barcode_key` ON `StoreProduct`(`barcode`);

CREATE TABLE `OrderQrCredential` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `orderId` INTEGER NOT NULL, `purpose` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL, `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE', `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL, `consumedById` INTEGER NULL, `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `OrderQrCredential_tokenHash_key`(`tokenHash`), INDEX `OrderQrCredential_orderId_purpose_status_idx`(`orderId`,`purpose`,`status`), PRIMARY KEY (`id`),
  CONSTRAINT `OrderQrCredential_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OrderScan` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `orderId` INTEGER NOT NULL, `credentialId` INTEGER NULL, `actorId` INTEGER NOT NULL,
  `purpose` VARCHAR(191) NOT NULL, `outcome` VARCHAR(191) NOT NULL, `failureReason` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `OrderScan_orderId_createdAt_idx`(`orderId`,`createdAt`), INDEX `OrderScan_actorId_createdAt_idx`(`actorId`,`createdAt`), PRIMARY KEY (`id`),
  CONSTRAINT `OrderScan_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `OrderScan_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OrderItemScan` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `orderItemId` INTEGER NOT NULL, `storeProductId` INTEGER NOT NULL, `actorId` INTEGER NOT NULL,
  `phase` VARCHAR(191) NOT NULL, `barcode` VARCHAR(191) NOT NULL, `quantity` INTEGER NOT NULL DEFAULT 1,
  `status` VARCHAR(191) NOT NULL DEFAULT 'VERIFIED', `mismatchReason` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `OrderItemScan_orderItemId_phase_status_idx`(`orderItemId`,`phase`,`status`), INDEX `OrderItemScan_actorId_createdAt_idx`(`actorId`,`createdAt`), PRIMARY KEY (`id`),
  CONSTRAINT `OrderItemScan_orderItemId_fkey` FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `OrderItemScan_storeProductId_fkey` FOREIGN KEY (`storeProductId`) REFERENCES `StoreProduct`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `OrderItemScan_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `Permission` (`key`,`description`) VALUES
 ('orders.qr.view','Generate and display owned order QR credentials.'),
 ('inventory.scan','Scan and verify products while packing store orders.'),
 ('deliveries.scan','Scan order handoff QR codes and rider pickup items.');
INSERT IGNORE INTO `RolePermission` (`roleId`,`permissionId`)
SELECT r.id,p.id FROM `Role` r JOIN `Permission` p
WHERE (r.name='CUSTOMER' AND p.`key`='orders.qr.view')
   OR (r.name IN ('VENDOR','STORE_AGENT') AND p.`key`='inventory.scan')
   OR (r.name='RIDER' AND p.`key`='deliveries.scan')
   OR (r.name='SUPER_ADMIN' AND p.`key` IN ('orders.qr.view','inventory.scan','deliveries.scan'));
