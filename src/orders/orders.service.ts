import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserDocument } from '../users/schemas/user.schema';
import { Order, OrderDocument, OrderStatus } from './schemas/order.schema';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel('User') private readonly userModel: Model<UserDocument>,
  ) {}

  async createOrder(userId: string, merchantId: string, amount: number, itemsCount = 1) {
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const order = new this.orderModel({
      userId: new Types.ObjectId(userId),
      merchantId: new Types.ObjectId(merchantId),
      orderNumber,
      amount,
      itemsCount,
      status: OrderStatus.PENDING,
      placedAt: new Date(),
    });

    await order.save();

    return {
      success: true,
      message: 'Order placed successfully',
      data: {
        _id: String(order._id),
        orderNumber: order.orderNumber,
        amount: order.amount,
        itemsCount: order.itemsCount,
        status: order.status,
        placedAt: order.placedAt,
      },
    };
  }

  async getMerchantOrders(merchantId: string, page = 1, limit = 20, status?: string) {
    const query: any = { merchantId: new Types.ObjectId(merchantId) };
    if (status && status !== 'all') {
      query.status = status;
    }

    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      this.orderModel.find(query).sort({ placedAt: -1 }).skip(skip).limit(limit).lean(),
      this.orderModel.countDocuments(query),
    ]);

    const userIds = orders.map((o) => o.userId).filter(Boolean);
    const users = await this.userModel.find({ _id: { $in: userIds } }).select('name').lean();
    const userMap = new Map(users.map((u: any) => [String(u._id), u.name]));

    return {
      success: true,
      data: orders.map((o: any) => ({
        _id: String(o._id),
        orderNumber: o.orderNumber,
        amount: o.amount,
        itemsCount: o.itemsCount,
        status: o.status,
        placedAt: o.placedAt,
        customerName: userMap.get(String(o.userId)) || 'Unknown Customer',
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMerchantOrderStats(merchantId: string) {
    const mId = new Types.ObjectId(merchantId);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [todayOrders, pendingOrders, completedOrders, revenueAgg] = await Promise.all([
      this.orderModel.countDocuments({ merchantId: mId, placedAt: { $gte: startOfDay } }),
      this.orderModel.countDocuments({ merchantId: mId, status: OrderStatus.PENDING }),
      this.orderModel.countDocuments({ merchantId: mId, status: OrderStatus.COMPLETED }),
      this.orderModel.aggregate([
        { $match: { merchantId: mId, status: { $in: [OrderStatus.ACCEPTED, OrderStatus.COMPLETED] } } },
        { $group: { _id: null, totalRevenue: { $sum: '$amount' } } },
      ]),
    ]);

    const totalRevenue = revenueAgg?.[0]?.totalRevenue || 0;

    return {
      success: true,
      data: {
        todayOrders,
        pendingOrders,
        completedOrders,
        totalRevenue,
      },
    };
  }

  async updateOrderStatus(merchantId: string, orderId: string, status: OrderStatus) {
    if (!Object.values(OrderStatus).includes(status)) {
      throw new BadRequestException('Invalid order status');
    }

    const order = await this.orderModel.findOne({
      _id: new Types.ObjectId(orderId),
      merchantId: new Types.ObjectId(merchantId),
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    order.status = status;
    if (status === OrderStatus.ACCEPTED) {
      order.acceptedAt = new Date();
    }
    if (status === OrderStatus.COMPLETED) {
      order.completedAt = new Date();
    }

    await order.save();

    return {
      success: true,
      message: 'Order status updated',
      data: {
        _id: String(order._id),
        status: order.status,
      },
    };
  }
}
