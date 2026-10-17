-- Link rider-created support tickets to the assigned delivery.
ALTER TABLE `SupportTicket`
    ADD COLUMN `deliveryId` INTEGER NULL;

CREATE INDEX `SupportTicket_deliveryId_status_createdAt_idx`
    ON `SupportTicket`(`deliveryId`, `status`, `createdAt`);

ALTER TABLE `SupportTicket`
    ADD CONSTRAINT `SupportTicket_deliveryId_fkey`
    FOREIGN KEY (`deliveryId`) REFERENCES `Delivery`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing production RIDER roles need the existing support permissions too;
-- updating seed data alone would only cover new databases.
INSERT INTO `Permission` (`key`, `description`)
VALUES
    ('support.tickets.create', 'Create support tickets.'),
    ('support.tickets.view.own', 'View own support tickets.')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT role_record.`id`, permission_record.`id`
FROM `Role` AS role_record
JOIN `Permission` AS permission_record
    ON permission_record.`key` IN ('support.tickets.create', 'support.tickets.view.own')
WHERE role_record.`name` = 'RIDER';
