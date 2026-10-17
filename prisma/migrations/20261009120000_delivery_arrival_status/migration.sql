-- Persist the rider's arrival at the customer so clients can restore the
-- delivery confirmation state after an app restart.
ALTER TABLE `Delivery`
    MODIFY `status` ENUM(
        'PENDING',
        'OFFERED',
        'ASSIGNED',
        'PICKED_UP',
        'IN_TRANSIT',
        'OUT_FOR_DELIVERY',
        'ARRIVED_AT_CUSTOMER',
        'DELIVERED',
        'FAILED',
        'CANCELLED'
    ) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `arrivedAt` DATETIME(3) NULL AFTER `pickedUpAt`;

ALTER TABLE `DeliveryStatusUpdate`
    MODIFY `status` ENUM(
        'PENDING',
        'OFFERED',
        'ASSIGNED',
        'PICKED_UP',
        'IN_TRANSIT',
        'OUT_FOR_DELIVERY',
        'ARRIVED_AT_CUSTOMER',
        'DELIVERED',
        'FAILED',
        'CANCELLED'
    ) NOT NULL;
