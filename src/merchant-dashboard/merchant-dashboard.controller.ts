import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MerchantDashboardService } from './merchant-dashboard.service';

@Controller('merchant-dashboard')
@UseGuards(JwtAuthGuard)
export class MerchantDashboardController {
  constructor(private readonly merchantDashboardService: MerchantDashboardService) {}

  @Get('summary')
  async getSummary(@CurrentUser() user: any) {
    const merchantId = user?.id || user?._id;
    return this.merchantDashboardService.getSummary(merchantId);
  }
}
