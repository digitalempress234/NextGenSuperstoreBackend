import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { ChatsService } from './chats.service';
import { CreateChatDto, SendChatMessageDto } from './dto/chats.dto';
import { OkExample } from '../common/api-docs';
import { CHAT_CONVERSATIONS_EXAMPLE } from '../common/docs-examples';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ChatsGateway } from './chats.gateway';
@ApiTags('Customer & Store Chat')
@ApiCookieAuth('purse_access_token')
@RequirePermissions('chats.use')
@Controller('chats')
export class ChatsController {
  constructor(
    private readonly chats: ChatsService,
    private readonly gateway: ChatsGateway,
  ) {}
  @Get()
  @ApiOperation({ summary: 'Customer or store role: list accessible conversations' })
  @OkExample(CHAT_CONVERSATIONS_EXAMPLE, 'Accessible customer/store conversations')
  list(@CurrentUser('id') id: number, @Query() query: PaginationDto) {
    return this.chats.list(id, query.page, query.limit);
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
  async send(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendChatMessageDto,
  ) {
    const message = await this.chats.send(userId, id, dto.body);
    this.gateway.broadcastMessage(id, message);
    return message;
  }
}
