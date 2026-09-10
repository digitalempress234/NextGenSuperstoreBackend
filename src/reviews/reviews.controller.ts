import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { OkExample } from '../common/api-docs';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('reviews.write')
  @ApiOperation({ summary: 'Submit a product review after a verified purchase' })
  @OkExample({ id: 1, rating: 5, comment: 'Great product!' }, 'Review created')
  create(@CurrentUser('id') userId: number, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(userId, dto);
  }

  @Public()
  @Get('product/:productId')
  @OkExample([{ id: 1, rating: 5, comment: 'Great product!' }], 'List of product reviews')
  listForProduct(@Param('productId', ParseIntPipe) productId: number) {
    return this.reviewsService.listForProduct(productId);
  }
}
