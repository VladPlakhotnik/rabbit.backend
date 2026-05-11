DELETE FROM "user_bonuses"
WHERE "reward_id" IN (
  SELECT "id" FROM "rewards" WHERE "type" = 'CASHBACK'
);

DELETE FROM "rewards"
WHERE "type" = 'CASHBACK';
