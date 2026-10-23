-- Allow approved stores to create moderated campaigns for their own customers.
ALTER TABLE `PushCampaign`
  DROP FOREIGN KEY `PushCampaign_createdById_fkey`;

ALTER TABLE `PushCampaign`
  MODIFY `audienceType` ENUM(
    'ALL_USERS',
    'CUSTOMERS',
    'RIDERS',
    'VENDORS',
    'SELECTED_USERS',
    'STORE_CUSTOMERS'
  ) NOT NULL,
  MODIFY `createdById` INTEGER NULL,
  ADD COLUMN `approvalStatus` ENUM('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN `rejectionReason` TEXT NULL,
  ADD COLUMN `reviewedAt` DATETIME(3) NULL,
  ADD COLUMN `createdByUserId` INTEGER NULL,
  ADD COLUMN `storeId` INTEGER NULL,
  ADD COLUMN `reviewedById` INTEGER NULL;

CREATE INDEX `PushCampaign_createdByUserId_createdAt_idx`
  ON `PushCampaign`(`createdByUserId`, `createdAt`);

CREATE INDEX `PushCampaign_storeId_status_createdAt_idx`
  ON `PushCampaign`(`storeId`, `status`, `createdAt`);

CREATE INDEX `PushCampaign_approvalStatus_createdAt_idx`
  ON `PushCampaign`(`approvalStatus`, `createdAt`);

ALTER TABLE `PushCampaign`
  ADD CONSTRAINT `PushCampaign_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `StaffUser`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `PushCampaign`
  ADD CONSTRAINT `PushCampaign_createdByUserId_fkey`
  FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `PushCampaign`
  ADD CONSTRAINT `PushCampaign_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PushCampaign`
  ADD CONSTRAINT `PushCampaign_reviewedById_fkey`
  FOREIGN KEY (`reviewedById`) REFERENCES `StaffUser`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
