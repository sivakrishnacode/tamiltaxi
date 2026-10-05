import { Role } from '../../generated/prisma/enums.js';
import { loginRole } from './auth.service.js';

describe('loginRole', () => {
  const admin = { role: Role.ADMIN, isAdminPhone: true };

  it('gives ADMIN to the admin panel only, promoting an ADMIN_PHONES number', () => {
    expect(loginRole({ app: 'admin', role: Role.PASSENGER, isAdminPhone: true, hasDriver: false })).toEqual({ role: Role.ADMIN, promote: true });
    expect(loginRole({ app: 'admin', ...admin, hasDriver: true })).toEqual({ role: Role.ADMIN, promote: false });
    // Not an admin: the panel gets their own role (and refuses it).
    expect(loginRole({ app: 'admin', role: Role.DRIVER, isAdminPhone: false, hasDriver: true })).toEqual({ role: Role.DRIVER, promote: false });
  });

  it('an admin who also drives is a DRIVER in the driver app and a PASSENGER in the passenger app', () => {
    expect(loginRole({ app: 'driver', ...admin, hasDriver: true })).toEqual({ role: Role.DRIVER, promote: false });
    expect(loginRole({ app: 'driver', role: Role.DRIVER, isAdminPhone: true, hasDriver: true })).toEqual({ role: Role.DRIVER, promote: false });
    expect(loginRole({ app: 'driver', ...admin, hasDriver: false })).toEqual({ role: Role.PASSENGER, promote: false });
    expect(loginRole({ app: 'passenger', ...admin, hasDriver: true })).toEqual({ role: Role.PASSENGER, promote: false });
  });

  it('older clients (no app): ADMIN only without a driver profile', () => {
    expect(loginRole({ role: Role.PASSENGER, isAdminPhone: true, hasDriver: false })).toEqual({ role: Role.ADMIN, promote: true });
    expect(loginRole({ ...admin, hasDriver: true })).toEqual({ role: Role.DRIVER, promote: false });
    expect(loginRole({ role: Role.DRIVER, isAdminPhone: true, hasDriver: true })).toEqual({ role: Role.DRIVER, promote: false });
  });

  it('drivers can sign in as passengers without changing their account role', () => {
    expect(loginRole({ app: 'passenger', role: Role.PASSENGER, isAdminPhone: false, hasDriver: false })).toEqual({ role: Role.PASSENGER, promote: false });
    expect(loginRole({ app: 'passenger', role: Role.DRIVER, isAdminPhone: false, hasDriver: true })).toEqual({ role: Role.PASSENGER, promote: false });
    expect(loginRole({ role: Role.DRIVER, isAdminPhone: false, hasDriver: true })).toEqual({ role: Role.DRIVER, promote: false });
  });
});
