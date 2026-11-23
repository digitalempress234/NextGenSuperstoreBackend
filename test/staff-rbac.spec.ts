import { StaffRole } from '@prisma/client';

import { StaffAccessController } from '../src/staff/staff.controller';
import {
  listStaffPermissionDefinitions,
  listStaffRoleDefinitions,
} from '../src/staff/staff.service';

describe('staff admin access-control contract', () => {
  it('lists every StaffRole with its effective permissions', () => {
    const roles = listStaffRoleDefinitions();

    expect(roles).toHaveLength(Object.values(StaffRole).length);
    expect(roles).toContainEqual({ name: 'SUPER_ADMIN', permissions: ['admin.*'] });
    expect(roles).toContainEqual(
      expect.objectContaining({
        name: 'OPERATIONS_ADMIN',
        permissions: expect.arrayContaining(['roles.assign', 'roles.revoke']),
      }),
    );
  });

  it('returns unique, sorted permission definitions with their assigned roles', () => {
    const permissions = listStaffPermissionDefinitions();
    const keys = permissions.map((permission) => permission.key);

    expect(keys).toEqual([...new Set(keys)].sort((left, right) => left.localeCompare(right)));
    expect(permissions).toContainEqual(
      expect.objectContaining({
        key: 'orders.view',
        roles: expect.arrayContaining(['OPERATIONS_ADMIN', 'FINANCE_ADMIN']),
      }),
    );
  });

  it('exposes the same definitions through the admin controller', () => {
    const controller = new StaffAccessController();

    expect(controller.roles()).toEqual(listStaffRoleDefinitions());
    expect(controller.permissions()).toEqual(listStaffPermissionDefinitions());
  });
});
