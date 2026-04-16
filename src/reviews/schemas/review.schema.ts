import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReviewDocument = Review & Document;

export enum ReviewStatus {
  APPROVED = 'approved',
  PENDING = 'pending',
  FLAGGED = 'flagged',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true, collection: 'reviews' })
export class Review {
  @Prop({ required: true, index: true })
  merchantId: Types.ObjectId;

  @Prop({ required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ required: true })
  content: string;

  @Prop({ enum: ReviewStatus, default: ReviewStatus.PENDING, index: true })
  status: ReviewStatus;

  @Prop({ type: [String], default: [] })
  tags: string[];
}

export const ReviewSchema = SchemaFactory.createForClass(Review);
ReviewSchema.index({ merchantId: 1, status: 1, createdAt: -1 });
ReviewSchema.index({ merchantId: 1, createdAt: -1 });
