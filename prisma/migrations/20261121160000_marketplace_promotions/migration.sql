CREATE TABLE `MarketplacePromotion` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `storeId` INTEGER NOT NULL,
  `createdByUserId` INTEGER NOT NULL,
  `reviewedById` INTEGER NULL,
  `title` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `subtitle` VARCHAR(191) NULL,
  `description` TEXT NULL,
  `imageUrl` TEXT NOT NULL,
  `deepLink` TEXT NULL,
  `ctaLabel` VARCHAR(191) NOT NULL DEFAULT 'Shop now',
  `badgeText` VARCHAR(191) NULL,
  `type` ENUM('DISCOUNT', 'FLASH_SALE', 'SEASONAL_SALE', 'PRODUCT_SPOTLIGHT', 'FREE_SHIPPING', 'OTHER') NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED') NOT NULL DEFAULT 'PENDING',
  `rejectionReason` TEXT NULL,
  `startsAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `endsAt` DATETIME(3) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `MarketplacePromotion_slug_key`(`slug`),
  INDEX `MarketplacePromotion_status_startsAt_endsAt_idx`(`status`, `startsAt`, `endsAt`),
  INDEX `MarketplacePromotion_storeId_status_createdAt_idx`(`storeId`, `status`, `createdAt`),
  INDEX `MarketplacePromotion_createdByUserId_createdAt_idx`(`createdByUserId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MarketplacePromotionProduct` (
  `promotionId` INTEGER NOT NULL,
  `storeProductId` INTEGER NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,

  INDEX `MarketplacePromotionProduct_storeProductId_idx`(`storeProductId`),
  PRIMARY KEY (`promotionId`, `storeProductId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MarketplacePromotion`
  ADD CONSTRAINT `MarketplacePromotion_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `MarketplacePromotion_createdByUserId_fkey`
  FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `MarketplacePromotion_reviewedById_fkey`
  FOREIGN KEY (`reviewedById`) REFERENCES `StaffUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `MarketplacePromotionProduct`
  ADD CONSTRAINT `MarketplacePromotionProduct_promotionId_fkey`
  FOREIGN KEY (`promotionId`) REFERENCES `MarketplacePromotion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `MarketplacePromotionProduct_storeProductId_fkey`
  FOREIGN KEY (`storeProductId`) REFERENCES `StoreProduct`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
