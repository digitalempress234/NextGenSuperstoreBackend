import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: number;
  action: string;
  permission?: string;
  entity: string;
  entityId: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  success?: boolean;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(entry: AuditEntry) {
    return this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        permission: entry.permission,
        entity: entry.entity,
        entityId: entry.entityId,
        changes: entry.changes as any,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        requestId: entry.requestId,
        success: entry.success ?? true,
      },
    });
  }

  list(limit = 100) {
    return this.prisma.auditLog.findMany({
      take: Math.min(limit, 500),
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
