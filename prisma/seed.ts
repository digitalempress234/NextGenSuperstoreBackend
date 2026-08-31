import {
  PrismaClient,
  RoleName,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const permissionDefinitions: Array<[string, string]> = [
  ['users.view', 'View customer and user profiles.'],
  ['users.update', 'Update customer and user profiles.'],
  ['users.freeze', 'Freeze or unfreeze user accounts.'],
  ['roles.create', 'Create platform roles.'],
  ['roles.assign', 'Assign roles to users.'],
  ['roles.revoke', 'Revoke user roles.'],
  ['roles.override', 'Grant or remove temporary permission overrides.'],
  ['stores.view', 'View stores and merchant profiles.'],
  ['stores.create', 'Create a store.'],
  ['stores.update', 'Update store information.'],
  ['stores.activate', 'Activate a merchant store.'],
  ['stores.suspend', 'Suspend a merchant store.'],
  ['merchants.approve', 'Approve merchant onboarding.'],
  ['merchants.suspend', 'Suspend a merchant.'],
  ['products.view', 'View products.'],
  ['products.create', 'Create catalog products.'],
  ['products.update', 'Update catalog products.'],
  ['products.archive', 'Archive catalog products.'],
  ['products.price.update', 'Update store-specific prices.'],
  ['inventory.adjust', 'Adjust inventory stock.'],
  ['orders.view', 'View orders.'],
  ['orders.cancel', 'Cancel orders.'],
  ['orders.refund.initiate', 'Initiate a refund workflow.'],
  ['orders.refund.approve', 'Approve a refund workflow.'],
  ['orders.status.update', 'Update order operational status.'],
  ['payments.view', 'View payment transactions.'],
  ['payments.reverse', 'Reverse a payment transaction.'],
  ['payments.reconcile', 'Reconcile payment transactions.'],
  ['wallets.view', 'View wallets.'],
  ['wallets.freeze', 'Freeze wallets.'],
  ['wallets.credit', 'Credit wallets.'],
  ['wallets.debit', 'Debit wallets.'],
  ['riders.view', 'View riders.'],
  ['riders.update', 'Update rider profiles.'],
  ['riders.approve', 'Approve riders.'],
  ['riders.suspend', 'Suspend riders.'],
  ['kyc.read', 'Read KYC documents and verification status.'],
  ['kyc.review', 'Approve or reject KYC documents.'],
  ['deliveries.view', 'View deliveries.'],
  ['deliveries.assign', 'Assign deliveries to riders.'],
  ['deliveries.status.update', 'Update delivery status.'],
  ['reports.view', 'View reports.'],
  ['reports.export', 'Export sensitive reports.'],
  ['notifications.send', 'Send operational notifications.'],
  ['integrations.manage', 'Manage API integrations and webhooks.'],
  ['risk.flag', 'Flag entities for risk review.'],
  ['risk.blacklist.create', 'Blacklist a risk entity.'],
  ['risk.blacklist.remove', 'Remove a blacklist entry.'],
  ['bnpl.loan.create', 'Create BNPL loans.'],
  ['bnpl.limit.adjust', 'Adjust customer BNPL limits.'],
  ['bnpl.repayment.restructure', 'Restructure BNPL repayment plans.'],
  ['audit.view', 'Read audit logs.'],
  ['audit.export', 'Export audit records.'],
];

const rolePermissions: Record<RoleName, string[]> = {
  CUSTOMER: [
    'users.view',
    'stores.view',
    'products.view',
    'orders.view',
    'deliveries.view',
  ],
  VENDOR: [
    'stores.view',
    'stores.create',
    'stores.update',
    'products.view',
    'products.create',
    'products.update',
    'products.price.update',
    'inventory.adjust',
    'orders.view',
    'orders.status.update',
  ],
  STORE_AGENT: [
    'stores.view',
    'products.view',
    'orders.view',
    'orders.status.update',
  ],
  RIDER: [
    'users.view',
    'riders.view',
    'riders.update',
    'deliveries.view',
    'deliveries.status.update',
  ],
  SUPER_ADMIN: permissionDefinitions.map((permission) => permission[0]),
  OPERATIONS_ADMIN: [
    'users.view',
    'stores.view',
    'stores.update',
    'products.view',
    'orders.view',
    'orders.cancel',
    'orders.status.update',
    'deliveries.view',
    'deliveries.assign',
    'deliveries.status.update',
    'reports.view',
  ],
  FINANCE_ADMIN: [
    'orders.view',
    'orders.refund.approve',
    'payments.view',
    'payments.reconcile',
    'payments.reverse',
    'wallets.view',
    'wallets.credit',
    'wallets.debit',
    'reports.view',
    'reports.export',
  ],
  RISK_COMPLIANCE_ADMIN: [
    'users.view',
    'users.freeze',
    'riders.view',
    'kyc.read',
    'kyc.review',
    'risk.flag',
    'risk.blacklist.create',
    'risk.blacklist.remove',
    'audit.view',
    'reports.view',
  ],
  MERCHANT_ADMIN: [
    'stores.view',
    'stores.create',
    'stores.update',
    'stores.activate',
    'stores.suspend',
    'merchants.approve',
    'merchants.suspend',
    'products.view',
    'products.create',
    'products.update',
    'inventory.adjust',
    'orders.view',
  ],
  CUSTOMER_SUPPORT_ADMIN: [
    'users.view',
    'users.update',
    'users.freeze',
    'orders.view',
    'orders.cancel',
    'orders.refund.initiate',
    'products.view',
    'stores.view',
  ],
  CREDIT_BNPL_ADMIN: [
    'users.view',
    'bnpl.loan.create',
    'bnpl.limit.adjust',
    'bnpl.repayment.restructure',
    'reports.view',
  ],
  AUDIT_OBSERVER_ADMIN: [
    'users.view',
    'stores.view',
    'products.view',
    'orders.view',
    'payments.view',
    'deliveries.view',
    'riders.view',
    'kyc.read',
    'reports.view',
    'reports.export',
    'audit.view',
    'audit.export',
  ],
  REGIONAL_ADMIN: [
    'users.view',
    'stores.view',
    'stores.update',
    'products.view',
    'orders.view',
    'orders.cancel',
    'deliveries.view',
    'deliveries.assign',
    'riders.view',
    'reports.view',
  ],
  COMPLIANCE_LEAD: [
    'users.view',
    'users.freeze',
    'riders.view',
    'kyc.read',
    'kyc.review',
    'risk.flag',
    'risk.blacklist.create',
    'audit.view',
    'audit.export',
    'reports.view',
  ],
};

const approvalPolicies = [
  {
    actionKey: 'orders.refund.approve',
    description: 'Refunds requiring Finance approval.',
    requiredApprovals: 1,
    initiatorPermissions: ['orders.refund.initiate'],
    approverPermissions: ['orders.refund.approve'],
  },
  {
    actionKey: 'payments.reverse',
    description: 'Payment reversals require Finance approval.',
    requiredApprovals: 1,
    initiatorPermissions: ['payments.view'],
    approverPermissions: ['payments.reverse'],
  },
  {
    actionKey: 'roles.assign',
    description: 'Role assignments are controlled by privileged administrators.',
    requiredApprovals: 1,
    initiatorPermissions: ['roles.assign'],
    approverPermissions: ['roles.assign'],
  },
  {
    actionKey: 'risk.blacklist.remove',
    description: 'Blacklist removals require Risk approval and audit.',
    requiredApprovals: 1,
    initiatorPermissions: ['risk.flag'],
    approverPermissions: ['risk.blacklist.remove'],
  },
];

async function main(): Promise<void> {
  for (const [key, description] of permissionDefinitions) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }

  for (const name of Object.values(RoleName)) {
    const metadata: Record<RoleName, { description: string; level: number }> = {
      CUSTOMER: { description: 'Marketplace customer.', level: 1 },
      VENDOR: { description: 'Merchant/vendor owner.', level: 2 },
      STORE_AGENT: { description: 'Store fulfillment agent.', level: 2 },
      RIDER: { description: 'Approved delivery rider.', level: 2 },
      SUPER_ADMIN: { description: 'Global system governance.', level: 100 },
      OPERATIONS_ADMIN: { description: 'Commerce operations.', level: 80 },
      FINANCE_ADMIN: { description: 'Financial operations.', level: 80 },
      RISK_COMPLIANCE_ADMIN: { description: 'Fraud, risk and KYC management.', level: 80 },
      MERCHANT_ADMIN: { description: 'Merchant ecosystem management.', level: 70 },
      CUSTOMER_SUPPORT_ADMIN: { description: 'Customer assistance.', level: 60 },
      CREDIT_BNPL_ADMIN: { description: 'Credit and BNPL operations.', level: 70 },
      AUDIT_OBSERVER_ADMIN: { description: 'Read-only oversight.', level: 50 },
      REGIONAL_ADMIN: { description: 'Region-scoped operations.', level: 60 },
      COMPLIANCE_LEAD: { description: 'Compliance oversight.', level: 75 },
    };

    const role = await prisma.role.upsert({
      where: { name },
      update: metadata[name],
      create: { name, ...metadata[name] },
    });

    for (const key of rolePermissions[name]) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }

  for (const policy of approvalPolicies) {
    await prisma.approvalPolicy.upsert({
      where: { actionKey: policy.actionKey },
      update: {
        description: policy.description,
        requiredApprovals: policy.requiredApprovals,
        initiatorPermissions: policy.initiatorPermissions,
        approverPermissions: policy.approverPermissions,
      },
      create: {
        actionKey: policy.actionKey,
        description: policy.description,
        requiredApprovals: policy.requiredApprovals,
        initiatorPermissions: policy.initiatorPermissions,
        approverPermissions: policy.approverPermissions,
      },
    });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    const admin = await prisma.user.upsert({
      where: { email: adminEmail.toLowerCase() },
      update: {},
      create: {
        email: adminEmail.toLowerCase(),
        firstName: 'Platform',
        lastName: 'Administrator',
        passwordHash: await bcrypt.hash(adminPassword, 12),
        isEmailVerified: true,
      },
    });

    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'SUPER_ADMIN' },
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: admin.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId: admin.id,
        roleId: role.id,
      },
    });

    console.log(`Super admin seeded: ${admin.email}`);
  }

  console.log('RBAC and approval policy seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
