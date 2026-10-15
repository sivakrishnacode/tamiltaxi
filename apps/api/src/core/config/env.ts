import { existsSync } from 'node:fs';

/** Validated runtime configuration read from environment variables. */
export interface Env {
  readonly nodeEnv: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly jwtSecret: string;
  readonly jwtExpiresIn: string;
  /** Dev/demo: no SMS; the OTP check is relaxed (see [devOtpCode]). */
  readonly isOtpDevMode: boolean;
  /**
   * With [isOtpDevMode]: the one code that signs in (DEV_OTP_CODE, 6 digits). Empty = any 6 digits except 000000,
   * allowed only outside production, so a public server never accepts any code.
   */
  readonly devOtpCode: string;
  readonly corsOrigins: readonly string[];
  /** Server-side Google Maps Platform key (Places, Geocoding, Routes). Empty = local fallback. */
  readonly googleMapsApiKey: string;
  /** Phones (+91…) that sign in as ADMIN (admin panel). */
  readonly adminPhones: readonly string[];
  /** Local fallback for uploaded files when no S3 bucket is configured (dev). */
  readonly uploadDir: string;
  /** Private S3 bucket for KYC documents and images. Empty = local disk ([uploadDir]). */
  readonly s3Bucket: string;
  readonly s3Region: string;
  /** Only for S3-compatible servers in dev (e.g. MinIO); empty = AWS. */
  readonly s3Endpoint: string;
  /** Public base URL of the live trip page (the admin app's `/track/<token>`), e.g. https://admin.example.com. */
  readonly shareBaseUrl: string;
  /** Firebase service-account JSON for FCM (from FIREBASE_SERVICE_ACCOUNT_B64, base64). Empty = push disabled. */
  readonly firebaseServiceAccount: string;
  /** Didit identity checks (selfie + ID). Empty key = checks disabled (dev): drivers are approved on documents alone. */
  readonly didit: {
    readonly apiKey: string;
    readonly webhookSecret: string;
    readonly driverWorkflowId: string;
    readonly riderWorkflowId: string;
    readonly baseUrl: string;
  };
  /** WATX (WhatsApp Business API) for login codes. Empty key = codes are not sent (dev mode logs them). */
  readonly watx: {
    readonly apiKey: string;
    /** Approved authentication templates, one body parameter (the code). The admin panel uses the passenger one. */
    readonly otpTemplates: { readonly passenger: string; readonly driver: string };
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

/** Reads and validates the environment once at start-up. */
export function loadEnv(): Env {
  // Local dev: read apps/api/.env if present (Docker passes real env vars instead).
  if (existsSync('.env')) process.loadEnvFile('.env');
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const jwtSecret = required('JWT_SECRET');
  if (nodeEnv === 'production' && jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
  const isOtpDevMode = (process.env.OTP_DEV_MODE ?? 'false') === 'true';
  const devOtpCode = process.env.DEV_OTP_CODE ?? '';
  if (devOtpCode && !/^\d{6}$/.test(devOtpCode)) throw new Error('DEV_OTP_CODE must be 6 digits');
  if (nodeEnv === 'production' && isOtpDevMode && !devOtpCode) {
    throw new Error('OTP_DEV_MODE in production needs DEV_OTP_CODE (a secret 6-digit code), or set OTP_DEV_MODE=false');
  }
  const watxApiKey = process.env.WATX_API_KEY ?? '';
  if (nodeEnv === 'production' && !isOtpDevMode && !watxApiKey) {
    throw new Error('OTP_DEV_MODE=false in production needs WATX_API_KEY, or no login code is ever sent');
  }
  return {
    nodeEnv,
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: required('REDIS_URL'),
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
    isOtpDevMode,
    devOtpCode,
    corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim()),
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
    adminPhones: (process.env.ADMIN_PHONES ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `+91${p.replace(/^\+91/, '')}`),
    uploadDir: process.env.UPLOAD_DIR ?? './uploads',
    s3Bucket: process.env.S3_BUCKET ?? '',
    s3Region: process.env.S3_REGION ?? process.env.AWS_REGION ?? 'ap-south-1',
    s3Endpoint: process.env.S3_ENDPOINT ?? '',
    shareBaseUrl: (process.env.SHARE_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, ''),
    firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT_B64
      ? Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8')
      : '',
    didit: {
      apiKey: process.env.DIDIT_API_KEY ?? '',
      webhookSecret: process.env.DIDIT_WEBHOOK_SECRET ?? '',
      driverWorkflowId: process.env.DIDIT_DRIVER_WORKFLOW_ID ?? '',
      riderWorkflowId: process.env.DIDIT_RIDER_WORKFLOW_ID ?? '',
      baseUrl: process.env.DIDIT_BASE_URL ?? 'https://verification.didit.me',
    },
    watx: {
      apiKey: watxApiKey,
      otpTemplates: {
        passenger: process.env.WATX_OTP_TEMPLATE_PASSENGER || 'login_otp_passenger',
        driver: process.env.WATX_OTP_TEMPLATE_DRIVER || 'login_otp_driver',
      },
    },
  };
}
