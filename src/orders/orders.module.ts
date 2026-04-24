import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Notification, NotificationSchema } from '../users/schemas/notification.schema';
import { OrdersKafkaController } from './orders.kafka.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order, OrderSchema } from './schemas/order.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [OrdersController, OrdersKafkaController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
