import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';
import { CartService } from './cart.service';

@ApiTags('Cart')
@ApiCookieAuth('purse_access_token')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get the authenticated customer cart' })
  @OkExample({
    id: 12,
    currency: 'NGN',
    subtotal: 9500,
    totalItems: 4,
    items: [
      {
        storeProductId: 42,
        quantity: 2,
        unitPrice: 475,
      },
    ],
  })
  @StandardErrors()
  getCart(@CurrentUser('id') userId: number) {
    return this.cartService.get(userId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add a store-specific product offer to cart' })
  @OkExample({
    id: 91,
    cartId: 12,
    storeProductId: 42,
    quantity: 2,
    unitPrice: 475,
    totalPrice: 950,
  })
  @StandardErrors()
  addItem(
    @CurrentUser('id') userId: number,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cartService.add(userId, dto.storeProductId, dto.quantity);
  }

  @Patch('items/:storeProductId')
  @ApiOperation({
    summary: 'Set the quantity of a cart line',
  })
  @ApiParam({ name: 'storeProductId', example: 42 })
  @OkExample({
    totalItems: 3,
    subtotal: 2850,
    items: [],
  })
  @StandardErrors()
  updateItem(
    @CurrentUser('id') userId: number,
    @Param('storeProductId', ParseIntPipe) storeProductId: number,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateQuantity(
      userId,
      storeProductId,
      dto.quantity,
    );
  }

  @Delete('items')
  @ApiOperation({
    summary: 'Clear all items from the authenticated customer cart',
  })
  @OkExample({ cleared: true })
  @StandardErrors()
  clear(@CurrentUser('id') userId: number) {
    return this.cartService.clear(userId);
  }


  @Delete('items/:storeProductId')
  @ApiOperation({ summary: 'Remove a store-specific product offer from cart' })
  @ApiParam({ name: 'storeProductId', example: 42 })
  @OkExample({ removed: true })
  @StandardErrors()
  removeItem(
    @CurrentUser('id') userId: number,
    @Param('storeProductId', ParseIntPipe) storeProductId: number,
  ) {
    return this.cartService.remove(userId, storeProductId);
  }
}
