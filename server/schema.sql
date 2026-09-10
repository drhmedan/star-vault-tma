-- ==========================================================
-- STAR VAULT TMA: TiDB Serverless High-Availability Schema
-- Compatible with MySQL 8.0 & TiDB Serverless Free Tier
--
-- This schema is the production target for the server-side
-- economy. The current server (`server/ledger.mjs`) writes an
-- append-only JSONL journal on the Koyeb disk; migrating to TiDB
-- means replaying that journal into `escrows` + `match_ledger`
-- (same fields, same order) and swapping the storage adapter.
-- ==========================================================

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY, -- Telegram User ID
  username VARCHAR(64),
  first_name VARCHAR(128),
  name VARCHAR(64) NOT NULL DEFAULT '',
  stars_balance INT DEFAULT 0,
  dust_balance INT DEFAULT 100,
  trophies INT DEFAULT 0,
  xp INT DEFAULT 0,
  matches INT DEFAULT 0,
  wins INT DEFAULT 0,
  level INT DEFAULT 1,
  is_vip BOOLEAN DEFAULT FALSE,
  referrer_id BIGINT NULL,
  referrals_count INT DEFAULT 0,
  referral_stars_earned INT DEFAULT 0,
  last_daily_spin TIMESTAMP NULL,
  last_free_case TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_referrer (referrer_id)
);

CREATE TABLE IF NOT EXISTS user_inventory (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  item_name_ar VARCHAR(128) NOT NULL,
  rarity ENUM('common', 'rare', 'epic', 'legendary', 'mythic') NOT NULL,
  star_value INT NOT NULL,
  acquired_from VARCHAR(64) NOT NULL, -- e.g. 'cyber_silver', 'wheel', 'battle'
  is_sold BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_invoices (
  invoice_id VARCHAR(128) PRIMARY KEY,
  user_id BIGINT NOT NULL,
  package_id VARCHAR(64) NOT NULL,
  stars_amount INT NOT NULL,
  status ENUM('pending', 'paid', 'cancelled') DEFAULT 'pending',
  telegram_payment_charge_id VARCHAR(128) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP NULL,
  INDEX idx_user_inv (user_id)
);

CREATE TABLE IF NOT EXISTS case_battles (
  id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  entry_stars INT NOT NULL,
  creator_id BIGINT NOT NULL,
  opponent_id BIGINT NULL,
  status ENUM('waiting', 'rolling', 'finished') DEFAULT 'waiting',
  creator_item_id VARCHAR(64) NULL,
  opponent_item_id VARCHAR(64) NULL,
  winner_id BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL
);

-- ---- Economy ledger (server-authoritative star movement) ----
-- Mirrors the JSONL journal fields in `server/ledger.mjs` so the TiDB
-- swap is a straight replay. `escrows` holds open stakes; `match_ledger`
-- is the immutable audit trail of settled matches.

CREATE TABLE IF NOT EXISTS escrows (
  escrow_id VARCHAR(64) PRIMARY KEY,
  player_id BIGINT NOT NULL,
  amount INT NOT NULL,
  room_code VARCHAR(64) NOT NULL,
  status ENUM('open', 'settled', 'cancelled', 'released') DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  settled_match_id VARCHAR(128) NULL,
  INDEX idx_escrow_player (player_id),
  INDEX idx_escrow_room (player_id, room_code)
);

CREATE TABLE IF NOT EXISTS match_ledger (
  match_id VARCHAR(128) PRIMARY KEY,
  player_id BIGINT NOT NULL,
  escrow_id VARCHAR(64) NULL,
  mode VARCHAR(16) NOT NULL,
  won BOOLEAN NOT NULL,
  stake INT NOT NULL DEFAULT 0,
  kills INT NOT NULL DEFAULT 0,
  damage INT NOT NULL DEFAULT 0,
  accuracy TINYINT NOT NULL DEFAULT 0,
  duration_sec INT NOT NULL DEFAULT 0,
  reward_xp INT NOT NULL DEFAULT 0,
  reward_trophies INT NOT NULL DEFAULT 0,
  reward_dust INT NOT NULL DEFAULT 0,
  reward_stars INT NOT NULL DEFAULT 0,
  balance_after INT NOT NULL,
  name VARCHAR(64) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ledger_player (player_id),
  INDEX idx_ledger_day (player_id, created_at)
);

-- ---- Non-match economy events (purchase / grant / topup) ----
-- One idempotent row per natural key (purchaseId / grantId / topupId),
-- mirroring the ledger's in-memory idempotency maps.

CREATE TABLE IF NOT EXISTS ledger_txns (
  txn_id VARCHAR(128) PRIMARY KEY,
  kind VARCHAR(16) NOT NULL, -- 'purchase' | 'grant' | 'topup'
  player_id BIGINT NOT NULL,
  amount INT NOT NULL,
  balance_after INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_txns_player (player_id, created_at)
);

-- ---- Replay watermark ----
-- Tracks the highest journal sequence mirrored into TiDB so a boot only
-- replays (and backfills) the journal tail.

CREATE TABLE IF NOT EXISTS meta (
  k VARCHAR(64) PRIMARY KEY,
  v VARCHAR(128) NOT NULL
);
