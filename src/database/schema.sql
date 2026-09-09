-- ==========================================================
-- STAR VAULT TMA: TiDB Serverless High-Availability Schema
-- Compatible with MySQL 8.0 & TiDB Serverless Free Tier
-- ==========================================================

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY, -- Telegram User ID
  username VARCHAR(64),
  first_name VARCHAR(128),
  stars_balance INT DEFAULT 0,
  dust_balance INT DEFAULT 100,
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
