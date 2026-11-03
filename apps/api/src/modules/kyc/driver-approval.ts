import { DriverStatus, IdentityStatus, KycDocType, KycStatus } from '../../generated/prisma/enums.js';

/** Documents every driver uploads for admin review. */
export const REQUIRED_DOCS: readonly KycDocType[] = [KycDocType.VEHICLE_RC, KycDocType.INSURANCE];
/**
 * The identity check by hand (instead of Didit): an admin verifies the licence and Aadhaar, and approves the profile
 * photo as the face that matches them. (`SELFIE` stays in the enum, unused since 3 Nov 2026.)
 */
export const IDENTITY_DOCS: readonly KycDocType[] = [KycDocType.DRIVING_LICENCE, KycDocType.AADHAAR];

/** The profile photo, as part of the identity check by hand: approved (`photoFile`), waiting, or none. */
export type PhotoState = 'APPROVED' | 'PENDING' | 'NONE';
/** Everything a driver can upload. */
export const UPLOAD_DOCS: readonly KycDocType[] = [...REQUIRED_DOCS, ...IDENTITY_DOCS];

/** How identities are checked: Didit's automatic check, or an admin looking at the licence, Aadhaar and selfie. */
export type IdentityMode = 'DIDIT' | 'MANUAL';

/**
 * Who must pass the identity step. With Didit, every driver (an app that can't reach Didit falls back to the manual
 * documents). By hand, only drivers whose app can upload them: it reports its version, older apps don't.
 */
export function isIdentityRequiredFor(mode: IdentityMode, appVersion: string | null): boolean {
  return mode === 'DIDIT' || appVersion !== null;
}

/**
 * The identity status the check by hand gives: the licence and Aadhaar verified and the profile photo approved →
 * APPROVED; either document rejected → DECLINED; anything waiting (or the photo still to come) → IN_REVIEW; null while
 * neither document is uploaded (the status is left as it is).
 */
export function manualIdentityStatus(docs: readonly { type: KycDocType; status: KycStatus }[], photo: PhotoState): IdentityStatus | null {
  const states = IDENTITY_DOCS.map((t) => docs.find((d) => d.type === t)?.status ?? KycStatus.NOT_UPLOADED);
  if (states.every((s) => s === KycStatus.NOT_UPLOADED)) return null;
  if (states.includes(KycStatus.REJECTED)) return IdentityStatus.DECLINED;
  if (states.every((s) => s === KycStatus.VERIFIED) && photo === 'APPROVED') return IdentityStatus.APPROVED;
  if (states.includes(KycStatus.UNDER_REVIEW) || states.every((s) => s === KycStatus.VERIFIED)) return IdentityStatus.IN_REVIEW;
  return null;
}

/**
 * A driver's status from their documents and identity check. APPROVED needs every required document verified
 * and (when Didit is set up) an approved identity; any rejection → REJECTED; otherwise PENDING. ON_HOLD is an
 * admin decision and never changes here, and already-approved drivers stay approved until something is rejected.
 * With [isAutoApprove] off (setting `driverAutoApprove`), a driver who passes every check stays PENDING ("ready to
 * approve") until an admin approves them.
 */
export function nextDriverStatus(params: {
  current: DriverStatus;
  docs: readonly { type: KycDocType; status: KycStatus }[];
  identity: IdentityStatus;
  isIdentityRequired: boolean;
  isAutoApprove?: boolean;
}): DriverStatus {
  if (params.current === DriverStatus.ON_HOLD) return params.current;
  const check = approvalChecklist(params);
  if (check.isRejected) return DriverStatus.REJECTED;
  if (check.isReady && params.isAutoApprove !== false) return DriverStatus.APPROVED;
  return params.current === DriverStatus.APPROVED ? DriverStatus.APPROVED : DriverStatus.PENDING;
}

/** One approval step: an uploaded document, or the identity check. */
export type CheckState = 'DONE' | 'REVIEW' | 'TODO' | 'FAILED';

export interface ApprovalChecklist {
  /** RC, insurance, then IDENTITY when Didit is set up. */
  readonly checks: readonly { readonly key: KycDocType | 'IDENTITY'; readonly state: CheckState }[];
  /** Every check done: approved at once, or waiting for an admin when auto-approval is off. */
  readonly isReady: boolean;
  readonly isRejected: boolean;
}

function docState(status: KycStatus | undefined): CheckState {
  if (status === KycStatus.VERIFIED) return 'DONE';
  if (status === KycStatus.UNDER_REVIEW) return 'REVIEW';
  if (status === KycStatus.REJECTED) return 'FAILED';
  return 'TODO';
}

function identityState(status: IdentityStatus): CheckState {
  if (status === IdentityStatus.APPROVED) return 'DONE';
  if (status === IdentityStatus.IN_REVIEW) return 'REVIEW';
  if (status === IdentityStatus.DECLINED) return 'FAILED';
  return 'TODO';
}

/** Where a driver's application stands, check by check (the admin Approvals queue shows the same steps). */
export function approvalChecklist(params: {
  docs: readonly { type: KycDocType; status: KycStatus }[];
  identity: IdentityStatus;
  isIdentityRequired: boolean;
}): ApprovalChecklist {
  const checks = [
    ...REQUIRED_DOCS.map((key) => ({ key, state: docState(params.docs.find((d) => d.type === key)?.status) })),
    ...(params.isIdentityRequired ? [{ key: 'IDENTITY' as const, state: identityState(params.identity) }] : []),
  ];
  return { checks, isReady: checks.every((c) => c.state === 'DONE'), isRejected: checks.some((c) => c.state === 'FAILED') };
}
