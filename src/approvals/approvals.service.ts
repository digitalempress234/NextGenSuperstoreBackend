import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { CreateApprovalRequestDto, DecideApprovalDto } from '../rbac/dto/rbac.dto';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async create(actorId: number, dto: CreateApprovalRequestDto) {
    const policy = await this.prisma.approvalPolicy.findUnique({
      where: { actionKey: dto.actionKey },
    });

    if (!policy || !policy.enabled) {
      throw new NotFoundException('Approval policy is not configured for this action.');
    }

    const context = await this.rbac.buildUserContext(actorId);
    const initiatorPermissions = (policy.initiatorPermissions as string[] | null) ?? [];

    if (!initiatorPermissions.some((permission) => this.rbac.hasPermission(context, permission))) {
      throw new ForbiddenException('User cannot initiate this approval workflow.');
    }

    const duplicate = await this.prisma.approvalRequest.findFirst({
      where: {
        actionKey: dto.actionKey,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        status: 'PENDING',
      },
    });

    if (duplicate) {
      throw new ConflictException('A pending approval request already exists.');
    }

    return this.prisma.approvalRequest.create({
      data: {
        policyId: policy.id,
        actionKey: dto.actionKey,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        requestedById: actorId,
        reason: dto.reason,
        payload: dto.payload as any,
      },
    });
  }

  async listPending() {
    return this.prisma.approvalRequest.findMany({
      where: { status: 'PENDING' },
      include: { policy: true, requestedBy: true },
      orderBy: { requestedAt: 'asc' },
    });
  }

  async decide(actorId: number, id: number, dto: DecideApprovalDto) {
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id },
      include: { policy: true },
    });

    if (!request) {
      throw new NotFoundException('Approval request not found.');
    }

    if (request.status !== 'PENDING') {
      throw new ConflictException('Approval request has already been decided.');
    }

    if (request.requestedById === actorId) {
      throw new ForbiddenException('Segregation of duties prevents self-approval.');
    }

    const context = await this.rbac.buildUserContext(actorId);
    const approverPermissions = (request.policy.approverPermissions as string[] | null) ?? [];

    if (!approverPermissions.some((permission) => this.rbac.hasPermission(context, permission))) {
      throw new ForbiddenException('User cannot approve this workflow.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      return tx.approvalRequest.update({
        where: { id },
        data: {
          status: dto.status,
          decidedById: actorId,
          decisionReason: dto.reason,
          decidedAt: new Date(),
        },
        include: { policy: true, requestedBy: true, decidedBy: true },
      });
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: `APPROVAL_${dto.status}`,
        permission: request.actionKey,
        entity: 'ApprovalRequest',
        entityId: String(id),
        changes: {
          status: dto.status,
          resourceType: request.resourceType,
          resourceId: request.resourceId,
          reason: dto.reason,
        },
      },
    });

    return result;
  }
}
