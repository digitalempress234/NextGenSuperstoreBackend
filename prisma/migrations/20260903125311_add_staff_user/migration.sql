-- AlterTable
ALTER TABLE `AuditLog` ADD COLUMN `staffActorId` INTEGER NULL;

-- CreateTable
CREATE TABLE `StaffUser` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `phoneNumber` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'FINANCE_ADMIN', 'RISK_COMPLIANCE_ADMIN', 'MERCHANT_ADMIN', 'CUSTOMER_SUPPORT_ADMIN', 'CREDIT_BNPL_ADMIN', 'AUDIT_OBSERVER_ADMIN', 'REGIONAL_ADMIN', 'COMPLIANCE_LEAD') NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT true,
    `createdById` INTEGER NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StaffUser_email_key`(`email`),
    UNIQUE INDEX `StaffUser_phoneNumber_key`(`phoneNumber`),
    INDEX `StaffUser_role_status_idx`(`role`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffSession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `staffUserId` INTEGER NOT NULL,
    `sessionTokenHash` VARCHAR(191) NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StaffSession_sessionTokenHash_key`(`sessionTokenHash`),
    INDEX `StaffSession_staffUserId_revokedAt_expiresAt_idx`(`staffUserId`, `revokedAt`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `AuditLog_staffActorId_createdAt_idx` ON `AuditLog`(`staffActorId`, `createdAt`);

-- AddForeignKey
ALTER TABLE `StaffSession` ADD CONSTRAINT `StaffSession_staffUserId_fkey` FOREIGN KEY (`staffUserId`) REFERENCES `StaffUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_staffActorId_fkey` FOREIGN KEY (`staffActorId`) REFERENCES `StaffUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
