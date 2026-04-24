export type Face = 1 | 2 | 3 | 4 | 5 | 6;
export type BetsCents = Record<Face, number>;
export type RtpMode = "normal" | "conservative" | "promotional";
export type LineOutcome = "lose" | "free" | "win" | "jackpot";

export type LineResult = {
  face: Face;
  stakeCents: number;
  count: number;
  outcome: LineOutcome;
  payoutCents: number;
  jackpotPaidCents: number;
};

export type PublicGameConfig = {
  creditValueCents: number;
  jackpotSeedCents: number;
  jackpotPoolCents: number;
  jackpotContributionPercent: number;
  houseMarginPercent: number;
  prizeFundPercent: number;
  soundVolume: number;
  brightness: number;
  cooldownMs: number;
  demoMode: boolean;
  maintenanceMode: boolean;
  rtpMode: RtpMode;
  minStakeCents: number;
  maxStakeCents: number;
  maxBetPerFaceCents: number;
  balanceCents: number;
  activePlayer: PlayerRecord | null;
  now: number;
};

export type PlayRecord = {
  id: string;
  createdAt: number;
  bets: BetsCents;
  dice: Face[][];
  lineResults: LineResult[];
  totalWagerCents: number;
  payoutCents: number;
  jackpotPaidCents: number;
  balanceAfterCents: number;
  freeRerolls: number;
};

export type PlayResponse = PlayRecord & {
  jackpotPoolCents: number;
};

export type AdminStats = {
  creditsSoldToday: number;
  totalWageredToday: number;
  totalPaidToday: number;
  netToday: number;
  playsToday: number;
  jackpotPoolCents: number;
  lastJackpotWinner: string | null;
  freeGamesToday: number;
  jackpotHitsToday: number;
};

export type AuditLogEntry = {
  id: number;
  createdAt: number;
  adminUser: string;
  action: string;
  beforeJson: string | null;
  afterJson: string | null;
};

export type BackupResult = {
  ok: true;
  file: string;
  createdAt: number;
};

export type PlayerStatus = "active" | "inactive";

export type PlayerRecord = {
  id: string;
  alias: string;
  phone: string | null;
  pin: string;
  balanceCents: number;
  status: PlayerStatus;
  note: string | null;
  qrCode: string | null;
  createdAt: number;
  createdBy: string;
};

export type PlayerMovementType = "initial_topup" | "topup" | "debit" | "status_change" | "play";

export type PlayerMovement = {
  id: string;
  playerId: string;
  createdAt: number;
  adminUser: string;
  type: PlayerMovementType;
  amountCents: number;
  balanceBeforeCents: number;
  balanceAfterCents: number;
  note: string | null;
};
