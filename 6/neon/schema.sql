CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  balance_cents INTEGER NOT NULL,
  credits_sold_cents INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plays (
  id TEXT PRIMARY KEY,
  created_at BIGINT NOT NULL,
  bets_json TEXT NOT NULL,
  dice_json TEXT NOT NULL,
  results_json TEXT NOT NULL,
  total_wager_cents INTEGER NOT NULL,
  payout_cents INTEGER NOT NULL,
  jackpot_paid_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  free_rerolls INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  created_at BIGINT NOT NULL,
  admin_user TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  alias TEXT NOT NULL,
  phone TEXT UNIQUE,
  pin TEXT NOT NULL UNIQUE,
  balance_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  note TEXT,
  qr_code TEXT,
  created_at BIGINT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_movements (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  created_at BIGINT NOT NULL,
  admin_user TEXT NOT NULL,
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  balance_before_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_plays_created ON plays (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_players_alias ON players (alias);
CREATE INDEX IF NOT EXISTS idx_player_movements_player_created ON player_movements (player_id, created_at DESC);
