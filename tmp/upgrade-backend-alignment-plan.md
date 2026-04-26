# Upgrade backend ↔ frontend alignment

## Current mismatches (frontend dictates, backend lags)

| # | Aspect | Frontend behavior | Backend status |
|---|---|---|---|
| 1 | Balance upgrade target | Sends `target_skin_id` explicitly (`IUpgradeBalanceRequest`) | Ignores it, picks a random skin via `getRandomTargetSkin` |
| 2 | Chance formula | Linear: `clamp(0..100, source / target * 100)`; rejects downgrade by returning 0 | Power curve `5 + 85 * ratio^1.5`, capped at 90, downgrade silently allowed |
| 3 | Min upgrade amount | `MIN_SUM = 0.25` clamps the input | `MIN_UPGRADE_AMOUNT = 100` ⇒ frontend can submit values backend rejects |
| 4 | Downgrade (target ≤ source) | `MarketSection` disables those cards entirely | Backend allows it with a TODO-style comment |
| 5 | History persistence | History page can read `upgrade_history` rows | Service never writes to it (injected `UserHistoryService` is unused) |
| 6 | TypeORM typing | n/a | `manager: any` violates strict-typing rule |

## Final state

- Balance mode honors `target_skin_id` (no random pick).
- Backend chance == frontend chance (linear, clamped 0..100).
- Downgrade rejected with `400` in both modes (matches frontend's UI rule).
- `MIN_UPGRADE_AMOUNT` lowered to `1` so any frontend-submittable value passes (with the existing positive-finite check still in place).
- Every upgrade attempt (success or failure) is persisted: `upgrade_history` row + `user_history` row, all inside the same transaction so rollback stays atomic.
- All transaction-manager parameters typed as `EntityManager`.
- Dead helper `getRandomTargetSkin` removed.

## Files to change

| # | File | Change |
|---|---|---|
| 1 | `rabbit.backend/src/modules/upgrade/upgrade.service.ts` | Replace formula, type `manager`, honor `target_skin_id` for balance, persist history, drop random-skin helper |
| 2 | `rabbit.backend/src/modules/upgrade/upgrade.controller.ts` | Require `target_skin_id` for both modes |
| 3 | `rabbit.backend/src/modules/upgrade/dto/upgrade.dto.ts` | Update doc/example to reflect that `target_skin_id` is required |
| 4 | `rabbit.backend/src/modules/upgrade/upgrade.module.ts` | Register `UpgradeHistory` so `manager.save(UpgradeHistory, ...)` is available even without `UserHistoryModule` re-exporting it |

## Task checklist

- [ ] Service: linear chance formula matching frontend.
- [ ] Service: reject downgrade (`usedPrice >= targetPrice`) with `BadRequestException`.
- [ ] Service: balance mode reads `target_skin_id` (404 if missing/not found, 400 if user already owns it).
- [ ] Service: lower `MIN_UPGRADE_AMOUNT` to `1`.
- [ ] Service: type all `manager` params as `EntityManager`.
- [ ] Service: write `UpgradeHistory` + `UserHistory` inside the transaction on every attempt (inventory + balance, success + failure).
- [ ] Service: remove unused `UserHistoryService` injection and `getRandomTargetSkin` helper.
- [ ] Controller: validate `target_skin_id` is present for both branches.
- [ ] DTO: clarify `target_skin_id` semantics.
- [ ] Module: ensure `UpgradeHistory` entity is registered.
