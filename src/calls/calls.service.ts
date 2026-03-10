import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Call, CallDocument, CallStatus, CallType } from './schemas/call.schema';
import { Conversation, ConversationDocument } from '../chats/schemas/conversation.schema';
import { ListCallsDto } from './dto/list-calls.dto';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);
  private readonly activeCallTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectModel(Call.name) private readonly callModel: Model<CallDocument>,
    @InjectModel(Conversation.name) private readonly conversationModel: Model<ConversationDocument>,
  ) {}

  private async getConversationForParticipant(userId: string, conversationId: string) {
    const conversation = await this.conversationModel.findById(conversationId).exec();
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (!conversation.participants.includes(String(userId))) {
      throw new BadRequestException('You are not part of this conversation');
    }

    return conversation;
  }

  async createCallInvite(callerId: string, conversationId: string, calleeId: string, type: CallType) {
    const conversation = await this.getConversationForParticipant(callerId, conversationId);

    if (!conversation.participants.includes(String(calleeId))) {
      throw new BadRequestException('Callee is not part of this conversation');
    }

    if (String(callerId) === String(calleeId)) {
      throw new BadRequestException('You cannot call yourself');
    }

    const busyCall = await this.callModel.findOne({
      participants: String(calleeId),
      status: { $in: ['initiated', 'ringing', 'accepted'] },
    });

    if (busyCall) {
      return {
        busy: true,
        call: null,
      };
    }

    const callId = uuidv4();
    const now = new Date();

    const call = await this.callModel.create({
      callId,
      conversationId,
      callerId: String(callerId),
      calleeId: String(calleeId),
      type,
      status: 'ringing',
      startedAt: now,
      participants: [String(callerId), String(calleeId)],
    });

    this.startMissedCallTimer(call.callId);

    return {
      busy: false,
      call,
    };
  }

  private startMissedCallTimer(callId: string) {
    const timeout = setTimeout(async () => {
      try {
        await this.endCallInternal(callId, 'missed', 'timeout');
      } catch (error) {
        this.logger.warn(`Missed call timer error for ${callId}: ${error.message}`);
      } finally {
        this.activeCallTimeouts.delete(callId);
      }
    }, 30000);

    this.activeCallTimeouts.set(callId, timeout);
  }

  private clearMissedCallTimer(callId: string) {
    const timeout = this.activeCallTimeouts.get(callId);
    if (timeout) {
      clearTimeout(timeout);
      this.activeCallTimeouts.delete(callId);
    }
  }

  async getCallByCallId(callId: string) {
    const call = await this.callModel.findOne({ callId }).exec();
    if (!call) {
      throw new NotFoundException('Call not found');
    }
    return call;
  }

  async ensureParticipant(callId: string, userId: string) {
    const call = await this.getCallByCallId(callId);
    if (!call.participants.includes(String(userId))) {
      throw new BadRequestException('You are not a participant of this call');
    }
    return call;
  }

  async acceptCall(callId: string, userId: string) {
    const call = await this.ensureParticipant(callId, userId);

    if (String(call.calleeId) !== String(userId)) {
      throw new BadRequestException('Only callee can accept call');
    }

    if (!['ringing', 'initiated'].includes(call.status)) {
      throw new BadRequestException(`Cannot accept call in status ${call.status}`);
    }

    call.status = 'accepted';
    call.answeredAt = new Date();
    await call.save();
    this.clearMissedCallTimer(call.callId);
    return call;
  }

  async rejectCall(callId: string, userId: string) {
    const call = await this.ensureParticipant(callId, userId);

    if (String(call.calleeId) !== String(userId)) {
      throw new BadRequestException('Only callee can reject call');
    }

    if (!['ringing', 'initiated'].includes(call.status)) {
      throw new BadRequestException(`Cannot reject call in status ${call.status}`);
    }

    return this.endCallInternal(call.callId, 'rejected', 'declined');
  }

  private async endCallInternal(callId: string, status: CallStatus, reason?: string) {
    const call = await this.getCallByCallId(callId);

    if (['ended', 'rejected', 'missed', 'failed', 'busy'].includes(call.status)) {
      return call;
    }

    const endedAt = new Date();
    call.status = status;
    call.endedAt = endedAt;
    call.endReason = reason;

    if (call.answeredAt) {
      const durationMs = endedAt.getTime() - new Date(call.answeredAt).getTime();
      call.durationSec = Math.max(0, Math.floor(durationMs / 1000));
    } else {
      call.durationSec = 0;
    }

    await call.save();
    this.clearMissedCallTimer(call.callId);
    return call;
  }

  async endCall(callId: string, userId: string, reason = 'hangup') {
    await this.ensureParticipant(callId, userId);
    return this.endCallInternal(callId, 'ended', reason);
  }

  async listCallsForUser(userId: string, query: ListCallsDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.callModel
        .find({ participants: String(userId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.callModel.countDocuments({ participants: String(userId) }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
