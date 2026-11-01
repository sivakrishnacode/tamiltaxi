import { ALL_PERMISSIONS, grants, isPermission } from './permissions.js';
import { neededFor } from './roles.guard.js';

describe('staff permissions', () => {
  it('lists a view and a change permission per area, plus exports and deleting accounts', () => {
    expect(ALL_PERMISSIONS).toContain('trips.view');
    expect(ALL_PERMISSIONS).toContain('cities.manage');
    expect(ALL_PERMISSIONS).toContain('exports');
    expect(isPermission('accounts.delete')).toBe(true);
    expect(isPermission('team.manage')).toBe(false);
  });

  it('lets change include view, never the other way round', () => {
    expect(grants(['drivers.manage'], 'drivers.view')).toBe(true);
    expect(grants(['drivers.view'], 'drivers.manage')).toBe(false);
    expect(grants(['drivers.manage'], 'riders.view')).toBe(false);
    expect(grants([], 'exports')).toBe(false);
  });

  it('asks a controller area for view on reads and change on writes', () => {
    expect(neededFor({ area: 'engage' }, 'GET')).toEqual(['engage.view']);
    expect(neededFor({ area: 'engage' }, 'POST')).toEqual(['engage.manage']);
    expect(neededFor({ any: ['riders.view', 'drivers.view'] }, 'GET')).toEqual(['riders.view', 'drivers.view']);
  });
});
