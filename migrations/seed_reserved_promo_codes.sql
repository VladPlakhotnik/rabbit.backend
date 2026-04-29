-- Reserve well-known marketing/system words from being claimed as custom partner codes.
-- All inserted as INACTIVE BONUS codes so activate() rejects them and partners cannot
-- claim them via setCustomReferralCode() (UPPER(code) uniqueness collision).
--
-- To free a slot for an admin campaign: UPDATE promo_codes SET status='ACTIVE' WHERE code=...

INSERT INTO promo_codes (code, type, status, description, created_at, current_uses)
VALUES
    ('FREE',     'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('GIFT',     'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('BONUS',    'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('PROMO',    'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('RABBIT',   'BONUS', 'INACTIVE', 'Reserved brand', CURRENT_TIMESTAMP, 0),
    ('RBT',      'BONUS', 'INACTIVE', 'Reserved brand', CURRENT_TIMESTAMP, 0),
    ('ADMIN',    'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('SUPPORT',  'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('WELCOME',  'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('CASE',     'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('SKIN',     'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('DROP',     'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('JACKPOT',  'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('START',    'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('NEW',      'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('FIRST',    'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('TEST',     'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('DEMO',     'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('ROOT',     'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('NULL',     'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('DEPOSIT',  'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('WIN',      'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('REWARD',   'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('VIP',      'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('PRO',      'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('REFERRAL', 'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('PARTNER',  'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('STREAMER', 'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('CASHBACK', 'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0),
    ('RESPIN',   'BONUS', 'INACTIVE', 'Reserved word', CURRENT_TIMESTAMP, 0)
ON CONFLICT DO NOTHING;
