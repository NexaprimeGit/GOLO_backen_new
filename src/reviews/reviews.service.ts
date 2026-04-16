import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserDocument } from '../users/schemas/user.schema';
import { Review, ReviewDocument, ReviewStatus } from './schemas/review.schema';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel('User') private readonly userModel: Model<UserDocument>,
  ) {}

  async getMerchantReviews(merchantId: string, page = 1, limit = 20, status?: string, search?: string) {
    const query: any = { merchantId: new Types.ObjectId(merchantId) };
    if (status && status !== 'all') {
      query.status = status;
    }

    if (search?.trim()) {
      query.content = { $regex: search.trim(), $options: 'i' };
    }

    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      this.reviewModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.reviewModel.countDocuments(query),
    ]);

    const userIds = reviews.map((r) => r.userId).filter(Boolean);
    const users = await this.userModel.find({ _id: { $in: userIds } }).select('name email').lean();
    const userMap = new Map(users.map((u: any) => [String(u._id), u]));

    return {
      success: true,
      data: reviews.map((r: any) => {
        const user = userMap.get(String(r.userId));
        return {
          _id: String(r._id),
          rating: r.rating,
          content: r.content,
          status: r.status,
          tags: r.tags || [],
          createdAt: r.createdAt,
          userName: user?.name || 'Unknown User',
          userEmail: user?.email || 'N/A',
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMerchantReviewStats(merchantId: string) {
    const mId = new Types.ObjectId(merchantId);

    const [totalReviews, pendingModeration, flaggedReviews, averageAgg] = await Promise.all([
      this.reviewModel.countDocuments({ merchantId: mId }),
      this.reviewModel.countDocuments({ merchantId: mId, status: ReviewStatus.PENDING }),
      this.reviewModel.countDocuments({ merchantId: mId, status: ReviewStatus.FLAGGED }),
      this.reviewModel.aggregate([
        { $match: { merchantId: mId } },
        { $group: { _id: null, avgRating: { $avg: '$rating' } } },
      ]),
    ]);

    return {
      success: true,
      data: {
        totalReviews,
        pendingModeration,
        flaggedReviews,
        averageRating: Number((averageAgg?.[0]?.avgRating || 0).toFixed(2)),
      },
    };
  }

  async updateReviewStatus(merchantId: string, reviewId: string, status: ReviewStatus) {
    if (!Object.values(ReviewStatus).includes(status)) {
      throw new BadRequestException('Invalid review status');
    }

    const review = await this.reviewModel.findOne({
      _id: new Types.ObjectId(reviewId),
      merchantId: new Types.ObjectId(merchantId),
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    review.status = status;
    await review.save();

    return {
      success: true,
      message: 'Review status updated',
      data: {
        _id: String(review._id),
        status: review.status,
      },
    };
  }
}
