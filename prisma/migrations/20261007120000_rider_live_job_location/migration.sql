ALTER TABLE `RiderProfile`
  ADD COLUMN `currentLatitude` DECIMAL(10, 7) NULL,
  ADD COLUMN `currentLongitude` DECIMAL(10, 7) NULL,
  ADD COLUMN `locationAccuracyM` DECIMAL(8, 2) NULL,
  ADD COLUMN `locationUpdatedAt` DATETIME(3) NULL;

CREATE INDEX `RiderProfile_locationUpdatedAt_idx`
  ON `RiderProfile`(`locationUpdatedAt`);

CREATE INDEX `Store_latitude_longitude_idx`
  ON `Store`(`latitude`, `longitude`);
