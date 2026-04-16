import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ad, AdDocument } from '../ads/schemas/category-schemas/ad.schema';
import { Order, OrderDocument, OrderStatus } from '../orders/schemas/order.schema';
import { Review, ReviewDocument } from '../reviews/schemas/review.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class MerchantDashboardService {
  constructor(
    @InjectModel(Ad.name) private readonly adModel: Model<AdDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async getSummary(merchantId: string) {
    const mId = new Types.ObjectId(merchantId);
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const [recentOrders, latestReviews, orderStats, reviewStats, adStats] = await Promise.all([
      this.orderModel.find({ merchantId: mId }).sort({ placedAt: -1 }).limit(5).lean(),
      this.reviewModel.find({ merchantId: mId }).sort({ createdAt: -1 }).limit(5).lean(),
      this.orderModel.aggregate([
        { $match: { merchantId: mId } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [{ $in: ['$status', [OrderStatus.ACCEPTED, OrderStatus.COMPLETED]] }, '$amount', 0],
              },
            },
          },
        },
      ]),
      this.reviewModel.aggregate([
        { $match: { merchantId: mId } },
        { $group: { _id: null, averageRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } },
      ]),
      this.adModel.aggregate([
        { $match: { userId: merchantId } },
        {
          $group: {
            _id: null,
            totalViews: { $sum: '$views' },
            weeklyViews: {
              $sum: {
                $cond: [{ $gte: ['$updatedAt', startOfWeek] }, '$views', 0],
              },
            },
          },
        },
      ]),
    ]);

    const reviewUserIds = latestReviews.map((r: any) => r.userId).filter(Boolean);
    const reviewUsers = await this.userModel.find({ _id: { $in: reviewUserIds } }).select('name').lean();
    const reviewUserMap = new Map(reviewUsers.map((u: any) => [String(u._id), u.name]));

    return {
      success: true,
      data: {
        stats: {
          totalOrders: orderStats?.[0]?.totalOrders || 0,
          revenue: orderStats?.[0]?.revenue || 0,
          totalReviews: reviewStats?.[0]?.totalReviews || 0,
          averageRating: Number((reviewStats?.[0]?.averageRating || 0).toFixed(2)),
          totalViews: adStats?.[0]?.totalViews || 0,
          weeklyViews: adStats?.[0]?.weeklyViews || 0,
        },
        recentOrders: recentOrders.map((o: any) => ({
          _id: String(o._id),
          orderNumber: o.orderNumber,
          amount: o.amount,
          itemsCount: o.itemsCount,
          status: o.status,
          placedAt: o.placedAt,
        })),
        latestReviews: latestReviews.map((r: any) => ({
          _id: String(r._id),
          rating: r.rating,
          content: r.content,
          status: r.status,
          createdAt: r.createdAt,
          userName: reviewUserMap.get(String(r.userId)) || 'Customer',
        })),
      },
    };
  }
}
