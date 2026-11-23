ALTER TABLE `Store`
  ADD COLUMN `timezone` VARCHAR(191) NOT NULL DEFAULT 'Africa/Lagos',
  ADD COLUMN `temporarilyClosedUntil` DATETIME(3) NULL,
  ADD COLUMN `acceptsScheduledOrders` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `StoreOperatingHour` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `storeId` INTEGER NOT NULL,
  `dayOfWeek` INTEGER NOT NULL,
  `opensMinute` INTEGER NULL,
  `closesMinute` INTEGER NULL,
  `isClosed` BOOLEAN NOT NULL DEFAULT false,

  UNIQUE INDEX `StoreOperatingHour_storeId_dayOfWeek_key`(`storeId`, `dayOfWeek`),
  INDEX `StoreOperatingHour_storeId_idx`(`storeId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `StoreOperatingHour`
  ADD CONSTRAINT `StoreOperatingHour_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
