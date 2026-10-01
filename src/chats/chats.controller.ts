import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { ChatsService } from './chats.service';
import { CreateChatDto, SendChatMessageDto } from './chats.dto';
@ApiTags('Customer & Store Chat')
@ApiCookieAuth('purse_access_token')
@RequirePermissions('chats.use')
@Controller('chats')
export class ChatsController {
  constructor(private readonly chats: ChatsService) {}
  @Get() @ApiOperation({ summary: 'Customer or store role: list accessible conversations' }) list(
    @CurrentUser('id') id: number,
  ) {
    return this.chats.list(id);
  }
  @Post() @ApiOperation({ summary: 'Customer: start or resume a store conversation' }) create(
    @CurrentUser('id') id: number,
    @Body() dto: CreateChatDto,
  ) {
    return this.chats.create(id, dto.storeId, dto.orderId);
  }
  @Get(':id/messages')
  @ApiOperation({ summary: 'Conversation member: list paginated messages' })
  messages(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chats.messages(
      userId,
      id,
      cursor ? Number(cursor) : undefined,
      limit ? Number(limit) : 15,
    );
  }
  @Post(':id/messages')
  @ApiOperation({ summary: 'Conversation member: persist and broadcast a message' })
  send(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chats.send(userId, id, dto.body);
  }
}
