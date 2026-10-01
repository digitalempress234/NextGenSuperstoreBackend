ALTER TABLE `RiderProfile`
    ADD COLUMN `rejectionReason` VARCHAR(191) NULL,
    ADD COLUMN `rejectedAt` DATETIME(3) NULL,
    ADD COLUMN `rejectedEvidence` JSON NULL,
    ADD COLUMN `submissionAttempt` INTEGER NOT NULL DEFAULT 0;
