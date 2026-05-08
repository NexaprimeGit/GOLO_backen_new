import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Get('deals')
  @UseGuards(JwtAuthGuard)
  async getDeals(@CurrentUser() user: any, @Query('page') page?: string, @Query('limit') limit?: string) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(50, Number(limit) || 8));
    const res = await this.recommendationsService.getRecommendedDeals(user.id || user._id, pageNum, limitNum);
    return { success: true, data: res.data, fromCache: res.fromCache };
  }

  @Get('debug')
  @UseGuards(JwtAuthGuard)
  async getDebugInfo(@CurrentUser() user: any) {
    const userId = user.id || user._id;
    const debugInfo = await this.recommendationsService.getDebugInfo(userId);
    return { success: true, debug: debugInfo };
  }
}
