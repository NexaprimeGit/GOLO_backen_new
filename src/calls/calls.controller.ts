import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CallsService } from './calls.service';
import { ListCallsDto } from './dto/list-calls.dto';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Get('history')
  async getHistory(@CurrentUser() user: any, @Query() query: ListCallsDto) {
    const data = await this.callsService.listCallsForUser(user.id, query);
    return {
      success: true,
      data,
    };
  }

  @Get(':callId')
  async getOne(@CurrentUser() user: any, @Param('callId') callId: string) {
    const call = await this.callsService.ensureParticipant(callId, user.id);
    return {
      success: true,
      data: call,
    };
  }
}
