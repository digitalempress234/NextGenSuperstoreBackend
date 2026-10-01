import { Module } from '@nestjs/common';

import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CouponService } from './coupon.service';

@Module({
  controllers: [CartController],
  providers: [CartService, CouponService],
  exports: [CartService, CouponService],
})
export class CartModule {}
