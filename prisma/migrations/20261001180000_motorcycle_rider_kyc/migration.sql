ALTER TABLE `RiderLicence`
    ADD COLUMN `provider` VARCHAR(191) NULL,
    ADD COLUMN `providerReference` VARCHAR(191) NULL,
    ADD COLUMN `providerStatus` VARCHAR(191) NULL,
    ADD COLUMN `providerRaw` JSON NULL,
    ADD COLUMN `idempotencyKey` VARCHAR(191) NULL,
    ADD COLUMN `consentCapturedAt` DATETIME(3) NULL,
    ADD COLUMN `verifiedAt` DATETIME(3) NULL;

CREATE INDEX `RiderLicence_providerReference_idx`
    ON `RiderLicence`(`providerReference`);

CREATE UNIQUE INDEX `RiderLicence_riderId_idempotencyKey_key`
    ON `RiderLicence`(`riderId`, `idempotencyKey`);
