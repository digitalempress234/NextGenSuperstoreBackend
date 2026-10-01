-- Rewards, referrals, promotions, returns, BNPL repayments, store chat, and support.
ALTER TABLE `CheckoutPaymentGroup` ADD COLUMN `discountAmount` DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE `Order` ADD COLUMN `discountAmount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN `shippingDiscount` DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE `ChatConversation` DROP FOREIGN KEY `ChatConversation_adminId_fkey`;
ALTER TABLE `ChatConversation` MODIFY `adminId` INTEGER NULL,
  ADD COLUMN `storeId` INTEGER NULL,
  ADD COLUMN `orderId` INTEGER NULL;
ALTER TABLE `ChatConversation` ADD CONSTRAINT `ChatConversation_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `ChatConversation_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ChatConversation_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX `ChatConversation_participantId_lastMessageAt_idx` ON `ChatConversation`(`participantId`, `lastMessageAt`);
CREATE INDEX `ChatConversation_storeId_lastMessageAt_idx` ON `ChatConversation`(`storeId`, `lastMessageAt`);

CREATE TABLE `RewardAccount` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `userId` INTEGER NOT NULL, `availablePoints` INTEGER NOT NULL DEFAULT 0,
  `giveawayEntries` INTEGER NOT NULL DEFAULT 0, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `RewardAccount_userId_key`(`userId`), PRIMARY KEY (`id`),
  CONSTRAINT `RewardAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CashbackReward` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `userId` INTEGER NOT NULL, `orderId` INTEGER NOT NULL,
  `percentage` DECIMAL(6,2) NOT NULL, `amount` DECIMAL(14,2) NOT NULL, `redeemedAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `status` VARCHAR(191) NOT NULL DEFAULT 'AVAILABLE', `redeemedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `CashbackReward_orderId_key`(`orderId`), INDEX `CashbackReward_userId_status_createdAt_idx`(`userId`,`status`,`createdAt`), PRIMARY KEY (`id`),
  CONSTRAINT `CashbackReward_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CashbackReward_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RewardRedemption` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `userId` INTEGER NOT NULL, `amount` DECIMAL(14,2) NOT NULL,
  `reference` VARCHAR(191) NOT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `RewardRedemption_reference_key`(`reference`), PRIMARY KEY (`id`),
  CONSTRAINT `RewardRedemption_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RewardVoucher` (
  `id` VARCHAR(191) NOT NULL, `code` VARCHAR(191) NOT NULL, `type` VARCHAR(191) NOT NULL, `title` VARCHAR(191) NOT NULL,
  `subtitle` VARCHAR(191) NULL, `description` TEXT NULL, `minimumOrderAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `discountPercent` DECIMAL(6,2) NULL, `discountAmount` DECIMAL(14,2) NULL, `pointsCost` INTEGER NOT NULL DEFAULT 0,
  `giveawayEntries` INTEGER NOT NULL DEFAULT 0, `storeId` INTEGER NULL, `isActive` BOOLEAN NOT NULL DEFAULT true,
  `startsAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `expiresAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `RewardVoucher_code_key`(`code`), PRIMARY KEY (`id`),
  CONSTRAINT `RewardVoucher_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserVoucher` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `userId` INTEGER NOT NULL, `voucherId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'CLAIMED', `claimedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `redeemedAt` DATETIME(3) NULL,
  UNIQUE INDEX `UserVoucher_userId_voucherId_key`(`userId`,`voucherId`), INDEX `UserVoucher_userId_status_idx`(`userId`,`status`), PRIMARY KEY (`id`),
  CONSTRAINT `UserVoucher_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UserVoucher_voucherId_fkey` FOREIGN KEY (`voucherId`) REFERENCES `RewardVoucher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CartVoucher` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `cartId` INTEGER NOT NULL, `voucherId` VARCHAR(191) NOT NULL, `userId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE INDEX `CartVoucher_cartId_key`(`cartId`), INDEX `CartVoucher_userId_idx`(`userId`), PRIMARY KEY (`id`),
  CONSTRAINT `CartVoucher_cartId_fkey` FOREIGN KEY (`cartId`) REFERENCES `Cart`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CartVoucher_voucherId_fkey` FOREIGN KEY (`voucherId`) REFERENCES `RewardVoucher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Coupon` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `code` VARCHAR(191) NOT NULL, `type` VARCHAR(191) NOT NULL,
  `discountPercent` DECIMAL(6,2) NULL, `discountAmount` DECIMAL(14,2) NULL, `minimumOrderAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `maximumDiscount` DECIMAL(14,2) NULL, `usageLimit` INTEGER NULL, `usedCount` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true, `startsAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `expiresAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Coupon_code_key`(`code`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CartCoupon` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `cartId` INTEGER NOT NULL, `couponId` INTEGER NOT NULL, `userId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE INDEX `CartCoupon_cartId_key`(`cartId`), INDEX `CartCoupon_userId_idx`(`userId`), PRIMARY KEY (`id`),
  CONSTRAINT `CartCoupon_cartId_fkey` FOREIGN KEY (`cartId`) REFERENCES `Cart`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CartCoupon_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `Coupon`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ReferralProfile` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `userId` INTEGER NOT NULL, `code` VARCHAR(191) NOT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ReferralProfile_userId_key`(`userId`), UNIQUE INDEX `ReferralProfile_code_key`(`code`), PRIMARY KEY (`id`),
  CONSTRAINT `ReferralProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Referral` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `referrerId` INTEGER NOT NULL, `referredUserId` INTEGER NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING', `rewardAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `qualifiedAt` DATETIME(3) NULL, `claimedAt` DATETIME(3) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `Referral_referredUserId_key`(`referredUserId`), INDEX `Referral_referrerId_status_idx`(`referrerId`,`status`), PRIMARY KEY (`id`),
  CONSTRAINT `Referral_referrerId_fkey` FOREIGN KEY (`referrerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Referral_referredUserId_fkey` FOREIGN KEY (`referredUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OrderReturn` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `orderId` INTEGER NOT NULL, `userId` INTEGER NOT NULL, `reason` VARCHAR(191) NOT NULL,
  `details` TEXT NULL, `items` JSON NULL, `evidenceUrls` JSON NULL, `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `refundAmount` DECIMAL(14,2) NULL, `resolutionNote` TEXT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  INDEX `OrderReturn_userId_status_createdAt_idx`(`userId`,`status`,`createdAt`), INDEX `OrderReturn_orderId_status_idx`(`orderId`,`status`), PRIMARY KEY (`id`),
  CONSTRAINT `OrderReturn_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BnplInstallment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `applicationId` INTEGER NOT NULL, `sequence` INTEGER NOT NULL, `amount` DECIMAL(14,2) NOT NULL,
  `amountPaid` DECIMAL(14,2) NOT NULL DEFAULT 0, `dueAt` DATETIME(3) NOT NULL, `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING', `paidAt` DATETIME(3) NULL,
  UNIQUE INDEX `BnplInstallment_applicationId_sequence_key`(`applicationId`,`sequence`), INDEX `BnplInstallment_status_dueAt_idx`(`status`,`dueAt`), PRIMARY KEY (`id`),
  CONSTRAINT `BnplInstallment_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `BnplApplication`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BnplRepayment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `installmentId` INTEGER NOT NULL, `userId` INTEGER NOT NULL, `amount` DECIMAL(14,2) NOT NULL,
  `method` ENUM('CARD','OPAY','WALLET','NEXTGEN_PURSE','EASYBUY','MAKOPA','WALLET_BNPL') NOT NULL,
  `status` ENUM('PENDING','PROCESSING','PAID','FAILED','REFUNDED','PARTIALLY_REFUNDED') NOT NULL DEFAULT 'PENDING',
  `reference` VARCHAR(191) NOT NULL, `paymentUrl` VARCHAR(191) NULL, `paidAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `BnplRepayment_reference_key`(`reference`), INDEX `BnplRepayment_userId_status_createdAt_idx`(`userId`,`status`,`createdAt`), PRIMARY KEY (`id`),
  CONSTRAINT `BnplRepayment_installmentId_fkey` FOREIGN KEY (`installmentId`) REFERENCES `BnplInstallment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `BnplRepayment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SupportTicket` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `ticketNumber` VARCHAR(191) NOT NULL, `userId` INTEGER NOT NULL, `orderId` INTEGER NULL,
  `category` VARCHAR(191) NOT NULL, `subject` VARCHAR(191) NOT NULL, `description` TEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN', `priority` VARCHAR(191) NOT NULL DEFAULT 'NORMAL', `attachments` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `SupportTicket_ticketNumber_key`(`ticketNumber`), INDEX `SupportTicket_userId_status_createdAt_idx`(`userId`,`status`,`createdAt`), PRIMARY KEY (`id`),
  CONSTRAINT `SupportTicket_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SupportReply` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `ticketId` INTEGER NOT NULL, `authorId` INTEGER NULL, `body` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`),
  CONSTRAINT `SupportReply_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `SupportTicket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SupportReply_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SupportFaq` (
  `id` INTEGER NOT NULL AUTO_INCREMENT, `category` VARCHAR(191) NOT NULL, `question` VARCHAR(191) NOT NULL, `answer` TEXT NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0, `isPublished` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  INDEX `SupportFaq_isPublished_category_sortOrder_idx`(`isPublished`,`category`,`sortOrder`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Install permissions for existing environments; production deploys do not run the seed.
INSERT IGNORE INTO `Permission` (`key`, `description`) VALUES
 ('rewards.view','View customer rewards and vouchers.'), ('rewards.redeem','Redeem customer cashback and vouchers.'),
 ('rewards.manage','Configure reward and voucher campaigns.'), ('referrals.view','View own referral progress.'),
 ('referrals.claim','Claim qualified referral rewards.'), ('orders.return.request','Request a return for an eligible order.'),
 ('chats.use','Use customer-to-store messaging.'), ('chats.moderate','Moderate marketplace conversations.'),
 ('support.tickets.create','Create support tickets.'), ('support.tickets.view.own','View own support tickets.'),
 ('support.tickets.manage','Review and resolve customer support tickets.'), ('bnpl.repayments.pay','Pay own BNPL installments.');

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT r.id, p.id FROM `Role` r JOIN `Permission` p
WHERE (r.name = 'CUSTOMER' AND p.`key` IN ('orders.cancel','orders.return.request','rewards.view','rewards.redeem','referrals.view','referrals.claim','chats.use','support.tickets.create','support.tickets.view.own','bnpl.repayments.pay'))
   OR (r.name IN ('VENDOR','STORE_AGENT') AND p.`key` = 'chats.use')
   OR (r.name = 'SUPER_ADMIN' AND p.`key` IN ('rewards.view','rewards.redeem','rewards.manage','referrals.view','referrals.claim','orders.return.request','chats.use','chats.moderate','support.tickets.create','support.tickets.view.own','support.tickets.manage','bnpl.repayments.pay'));

INSERT IGNORE INTO `PlatformConfig` (`key`,`value`,`description`,`updatedAt`) VALUES
 ('cashback_rate','1','Cashback percentage awarded when an order is completed.',CURRENT_TIMESTAMP(3)),
 ('referral_reward_amount','1000','NGN reward after a referred customer completes a first order.',CURRENT_TIMESTAMP(3));
