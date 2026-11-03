import { DriverStatus, IdentityStatus, KycDocType, KycStatus } from '../../generated/prisma/enums.js';
import { approvalChecklist, isIdentityRequiredFor, manualIdentityStatus, nextDriverStatus } from './driver-approval.js';

const docs = (rc: KycStatus, ins: KycStatus) => [
  { type: KycDocType.VEHICLE_RC, status: rc },
  { type: KycDocType.INSURANCE, status: ins },
  // Old rows no longer count (police verification isn't needed).
  { type: KycDocType.POLICE_VERIFICATION, status: KycStatus.NOT_UPLOADED },
];
const { VERIFIED, UNDER_REVIEW, REJECTED } = KycStatus;

describe('nextDriverStatus', () => {
  it('approves once RC + insurance are verified and identity is approved', () => {
    expect(nextDriverStatus({ current: DriverStatus.PENDING, docs: docs(VERIFIED, VERIFIED), identity: IdentityStatus.APPROVED, isIdentityRequired: true })).toBe(DriverStatus.APPROVED);
  });

  it('waits for the identity check', () => {
    expect(nextDriverStatus({ current: DriverStatus.PENDING, docs: docs(VERIFIED, VERIFIED), identity: IdentityStatus.IN_REVIEW, isIdentityRequired: true })).toBe(DriverStatus.PENDING);
  });

  it('does not need identity when Didit is not set up', () => {
    expect(nextDriverStatus({ current: DriverStatus.PENDING, docs: docs(VERIFIED, VERIFIED), identity: IdentityStatus.NOT_STARTED, isIdentityRequired: false })).toBe(DriverStatus.APPROVED);
  });

  it('rejects on a rejected document or a declined identity', () => {
    expect(nextDriverStatus({ current: DriverStatus.PENDING, docs: docs(REJECTED, VERIFIED), identity: IdentityStatus.APPROVED, isIdentityRequired: true })).toBe(DriverStatus.REJECTED);
    expect(nextDriverStatus({ current: DriverStatus.APPROVED, docs: docs(VERIFIED, VERIFIED), identity: IdentityStatus.DECLINED, isIdentityRequired: true })).toBe(DriverStatus.REJECTED);
  });

  it('goes back to pending after a re-upload, keeps approved drivers and never touches ON_HOLD', () => {
    expect(nextDriverStatus({ current: DriverStatus.REJECTED, docs: docs(UNDER_REVIEW, VERIFIED), identity: IdentityStatus.APPROVED, isIdentityRequired: true })).toBe(DriverStatus.PENDING);
    expect(nextDriverStatus({ current: DriverStatus.APPROVED, docs: docs(VERIFIED, VERIFIED), identity: IdentityStatus.NOT_STARTED, isIdentityRequired: true })).toBe(DriverStatus.APPROVED);
    expect(nextDriverStatus({ current: DriverStatus.ON_HOLD, docs: docs(VERIFIED, VERIFIED), identity: IdentityStatus.APPROVED, isIdentityRequired: true })).toBe(DriverStatus.ON_HOLD);
  });

  it('leaves a ready driver pending for an admin when auto-approval is off', () => {
    const ready = { docs: docs(VERIFIED, VERIFIED), identity: IdentityStatus.APPROVED, isIdentityRequired: true, isAutoApprove: false };
    expect(nextDriverStatus({ current: DriverStatus.PENDING, ...ready })).toBe(DriverStatus.PENDING);
    // Approved by an admin: stays approved; a rejection still rejects.
    expect(nextDriverStatus({ current: DriverStatus.APPROVED, ...ready })).toBe(DriverStatus.APPROVED);
    expect(nextDriverStatus({ current: DriverStatus.PENDING, ...ready, docs: docs(REJECTED, VERIFIED) })).toBe(DriverStatus.REJECTED);
  });
});

describe('approvalChecklist', () => {
  it('lists each document and the identity check with its state', () => {
    const c = approvalChecklist({ docs: docs(VERIFIED, UNDER_REVIEW), identity: IdentityStatus.IN_REVIEW, isIdentityRequired: true });
    expect(c.checks).toEqual([
      { key: KycDocType.VEHICLE_RC, state: 'DONE' },
      { key: KycDocType.INSURANCE, state: 'REVIEW' },
      { key: 'IDENTITY', state: 'REVIEW' },
    ]);
    expect(c.isReady).toBe(false);
    expect(c.isRejected).toBe(false);
  });

  it('skips identity without Didit and treats a missing row as to do', () => {
    const c = approvalChecklist({ docs: [{ type: KycDocType.VEHICLE_RC, status: VERIFIED }], identity: IdentityStatus.NOT_STARTED, isIdentityRequired: false });
    expect(c.checks.map((x) => x.state)).toEqual(['DONE', 'TODO']);
    expect(approvalChecklist({ docs: docs(VERIFIED, VERIFIED), identity: IdentityStatus.DECLINED, isIdentityRequired: false }).isReady).toBe(true);
    expect(approvalChecklist({ docs: docs(VERIFIED, VERIFIED), identity: IdentityStatus.DECLINED, isIdentityRequired: true }).isRejected).toBe(true);
  });
});

describe('identity check by hand', () => {
  const doc = (type: KycDocType, status: KycStatus) => ({ type, status });
  const trio = (status: KycStatus) => [doc(KycDocType.DRIVING_LICENCE, status), doc(KycDocType.AADHAAR, status), doc(KycDocType.SELFIE, status)];

  it('approves once the licence, Aadhaar and selfie are all verified', () => {
    expect(manualIdentityStatus(trio(KycStatus.VERIFIED))).toBe(IdentityStatus.APPROVED);
    expect(manualIdentityStatus([...trio(KycStatus.VERIFIED).slice(0, 2), doc(KycDocType.SELFIE, KycStatus.UNDER_REVIEW)])).toBe(IdentityStatus.IN_REVIEW);
  });

  it('declines on any rejection and leaves the status alone before an upload', () => {
    expect(manualIdentityStatus([doc(KycDocType.DRIVING_LICENCE, KycStatus.REJECTED), doc(KycDocType.AADHAAR, KycStatus.VERIFIED)])).toBe(IdentityStatus.DECLINED);
    expect(manualIdentityStatus([doc(KycDocType.VEHICLE_RC, KycStatus.UNDER_REVIEW)])).toBeNull();
    expect(manualIdentityStatus(trio(KycStatus.NOT_UPLOADED))).toBeNull();
  });

  it('asks every driver with Didit, and by hand only apps that can upload (they send their version)', () => {
    expect(isIdentityRequiredFor('DIDIT', null)).toBe(true);
    expect(isIdentityRequiredFor('MANUAL', '0.1.2')).toBe(true);
    expect(isIdentityRequiredFor('MANUAL', null)).toBe(false);
  });
});
