import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ required: true })
  action: string;

  @Prop({ required: true })
  adminId: string;

  @Prop({ required: true })
  adminEmail: string;

  @Prop({ required: true })
  targetId: string;

  @Prop({ required: true, enum: ['Ad', 'User', 'Report'] })
  targetType: string;

  @Prop({ type: Object })
  details: any;

  @Prop()
  createdAt: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
