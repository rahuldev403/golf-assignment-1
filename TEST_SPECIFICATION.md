# 🧪 TEST SPECIFICATION - Draw Simulation & Publishing

**Objective:** Validate all business requirements and edge cases for draw simulation and publishing logic.

**Platforms:** Node.js / Next.js API routes with Supabase

---

## TEST SUITE 1: REQUIREMENT #1 - Draw Type Matching (5/4/3-number)

### Test Case 1.1: Exactly 3-Number Match

```
Setup:
  - Create 5 active subscribers with 5 latest scores each
  - Winning numbers: [1, 10, 20, 30, 40]
  - User A scores: [1, 10, 20, 99, 88] (exactly 3 matches)

Action:
  - Call POST /api/admin/draw/simulate with valid Bearer token

Expected Results:
  - winnersByTier[3].includes(userA.id) === true
  - Response summary.winners_count.match_3 >= 1
  - User A appears in winners table with match_type = 3

Assertion:
  draw.id !== null
  summary.winners_count.match_3 >= 1
  winners[0].match_type === 3
```

### Test Case 1.2: Exactly 4-Number Match

```
Setup:
  - Winning numbers: [1, 10, 20, 30, 40]
  - User B scores: [1, 10, 20, 30, 99] (exactly 4 matches)

Expected Results:
  - winnersByTier[4].includes(userB.id) === true
  - summary.winners_count.match_4 >= 1
  - User B has match_type = 4 in winners table
```

### Test Case 1.3: Exactly 5-Number Match

```
Setup:
  - Winning numbers: [1, 10, 20, 30, 40]
  - User C scores: [1, 10, 20, 30, 40] (all 5 matches)

Expected Results:
  - winnersByTier[5].includes(userC.id) === true
  - summary.winners_count.match_5 >= 1
  - User C has match_type = 5 in winners table
  - User C is eligible for jackpot
```

### Test Case 1.4: Partial Match (2-number)

```
Setup:
  - Winning numbers: [1, 10, 20, 30, 40]
  - User D scores: [1, 10, 99, 88, 77] (only 2 matches)

Expected Results:
  - User D NOT in any tier (winnersByTier[3/4/5] all exclude userD.id)
  - User D NOT in winners table
```

### Test Case 1.5: No Matches

```
Setup:
  - Winning numbers: [1, 10, 20, 30, 40]
  - User E scores: [50, 51, 52, 53, 54] (0 matches)

Expected Results:
  - User E NOT in any tier
  - User E NOT in winners table
```

---

## TEST SUITE 2: REQUIREMENT #2 - Prize Pool Split (40/35/25%)

### Test Case 2.1: Pool Allocation Math

```
Setup:
  - 100 active subscribers
  - Monthly price: $10 per user
  - Prize percentage: 50% of revenue
  - Previous rollover: $500

Calculation:
  Revenue: 100 × $10 × 0.50 = $500
  Total Pool: $500 + $500 = $1,000

  Tier 5 pool: $1,000 × 0.40 = $400
  Tier 4 pool: $1,000 × 0.35 = $350
  Tier 3 pool: $1,000 × 0.25 = $250
  Sum: $1,000 ✓

Expected Results in Response:
  summary.tier_pools.match_5 === 400
  summary.tier_pools.match_4 === 350
  summary.tier_pools.match_3 === 250
  summary.accounting.pool_sum === 1000
  Math.abs(summary.accounting.pool_sum - 1000) < 0.01
```

### Test Case 2.2: Payout Per Winner

```
Setup:
  - Tier 5 pool: $400
  - Winners in tier 5: 2 people

Calculation:
  Prize each: $400 / 2 = $200

Expected Results:
  summary.payouts_each.match_5 === 200
  winners[tier5_index].prize_amount === 200
  winner[tier5_index+1].prize_amount === 200

Verification:
  (winners with match_type=5).forEach(winner => {
    assert winner.prize_amount === 200
  })
```

### Test Case 2.3: Pool with Rounding

```
Setup:
  - Tier 3 pool: $250
  - Winners in tier 3: 3 people

Calculation:
  Prize each: $250 / 3 = $83.333... → rounds to $83.33

Expected Results:
  summary.payouts_each.match_3 === 83.33
  Total paid: 83.33 × 3 = $249.99
  Variance: $0.01 (expected due to rounding)

Assertion:
  summary.accounting.variance <= 0.03  // Acceptable variance
```

---

## TEST SUITE 3: REQUIREMENT #3 - Division by Zero Safeguards

### Test Case 3.1: Zero Winners Tier 5

```
Setup:
  - Total pool: $1,000
  - Tier 5 pool: $400
  - Winners in tier 5: 0

Expected Results:
  Response should NOT contain errors
  summary.payouts_each.match_5 === 0
  No NaN or Infinity in responses

Assertion:
  Number.isFinite(summary.payouts_each.match_5) === true
  summary.payouts_each.match_5 === 0
```

### Test Case 3.2: Zero Winners Tier 4

```
Setup:
  - Tier 4 pool: $350
  - Winners in tier 4: 0

Expected Results:
  summary.payouts_each.match_4 === 0
  No mathematical error thrown

Assertion:
  !Number.isNaN(summary.payouts_each.match_4)
  summary.payouts_each.match_4 === 0
```

### Test Case 3.3: Zero Winners Tier 3

```
Setup:
  - Tier 3 pool: $250
  - Winners in tier 3: 0

Expected Results:
  summary.payouts_each.match_3 === 0

Assertion:
  Number.isFinite(summary.payouts_each.match_3) === true
```

### Test Case 3.4: Zero Winners All Tiers

```
Setup:
  - 100 active users, pool: $1,000
  - Winning numbers: [1, 2, 3, 4, 5]
  - All users have scores: [40, 41, 42, 43, 44]
  - No matches → 0 winners in all tiers

Expected Results:
  summary.payouts_each.match_5 === 0
  summary.payouts_each.match_4 === 0
  summary.payouts_each.match_3 === 0
  No errors thrown
  All values are finite numbers
```

---

## TEST SUITE 4: REQUIREMENT #4 - Jackpot Rollover

### Test Case 4.1: Tier 5 No Winners → Rollover 40%

```
Setup:
  - Total pool: $1,000
  - Tier 5 pool: $400
  - Winners in tier 5: 0

Expected Results:
  summary.rollover.generated === 400
  system_settings.current_jackpot_rollover === 400

Assertion:
  response.summary.unclaimed_tiers.match_5 === 400
  system_settings[0].current_jackpot_rollover === 400.00
```

### Test Case 4.2: Tier 5 Has Winners → No Rollover

```
Setup:
  - Tier 5 pool: $400
  - Winners in tier 5: 2

Expected Results:
  All $400 is paid out ($200 each)
  summary.rollover.generated === 0

Assertion:
  summary.unclaimed_tiers.match_5 === 0
  system_settings.current_jackpot_rollover === 0
```

### Test Case 4.3: CRITICAL FIX - Tier 4 & 3 No Winners → Rollover (PATCHED)

```
Setup:
  - Tier 4 pool: $350
  - Tier 3 pool: $250
  - Winners in tier 4: 0
  - Winners in tier 3: 0

Expected Results (AFTER PATCH):
  summary.rollover.generated === 600  // ← Includes tier 4 & 3!
  summary.unclaimed_tiers.match_4 === 350
  summary.unclaimed_tiers.match_3 === 250
  system_settings.current_jackpot_rollover === 600

Before Patch (BUG):
  rollover would only be tier 5 ($0 in this case)
  $600 would be LOST

REGRESSION TEST: Verify old behavior is fixed
```

### Test Case 4.4: Mixed Unclaimed Tiers

```
Setup:
  - Tier 5: $400, winners: 2 (pays out, no rollover)
  - Tier 4: $350, winners: 0 (rolls over)
  - Tier 3: $250, winners: 1 (pays out, no rollover)

Expected Results:
  Total payouts: ($200 × 2) + ($250 × 1) = $650
  Total rollover: $350
  Next month starts with: $350 + (new revenue)

Assertion:
  summary.rollover.generated === 350
  system_settings.current_jackpot_rollover === 350
```

### Test Case 4.5: Rollover Persists to Publish

```
Setup:
  - Simulate creates draw with rollover_amount_generated = $400

Action:
  - Call POST /api/admin/draw/publish

Expected Results:
  published_draw.rollover_amount_generated === 400
  system_settings.current_jackpot_rollover === 400 (persisted)
  response.rollover_applied_for_next_month === 400
```

---

## TEST SUITE 5: REQUIREMENT #5 - Simulation vs Publish Isolation

### Test Case 5.1: Simulate Overwrites Previous Simulated, Not Published

```
Setup:
  - Month: March 2026
  - Existing draws:
    * DrawA (status: "simulated", draw_date: March 1)
    * DrawB (status: "published", draw_date: March 10)
  - Old winners: 50 records for DrawA

Action:
  - POST /api/admin/draw/simulate (new simulation)

Expected Results:
  - DrawA deleted (simulated → overwritten)
  - DrawB remains (published → untouched)
  - All 50 old winners deleted
  - New draw created with new winners
  - Total draws in DB: 2 (DrawB + new DrawC)

Verification:
  SELECT COUNT(*) FROM draws WHERE status = "published" → 1 (unchanged)
  SELECT COUNT(*) FROM draws WHERE status = "simulated" → 1 (new)
  SELECT COUNT(*) FROM winners WHERE draw_id = DrawA.id → 0 (deleted)
```

### Test Case 5.2: Multiple Month Isolation

```
Setup:
  - February draws: 1 published + 1 simulated
  - March draws: 0 draws
  - April draws: 1 published

Action:
  - POST /api/admin/draw/simulate (for March 2026)

Expected Results:
  - February simulated deleted (old month)
  - February published remains
  - April published remains
  - New March simulated created

Assertion:
  February simulated does NOT exist
  February published still exists
  March simulated exists
  April published still exists
```

### Test Case 5.3: Same Month, Different Draw IDs

```
Setup:
  - Current draw in DB: DrawA (simulated, this month)

Action:
  - POST /api/admin/draw/simulate (new simulation this month)

Expected Results:
  - New draw has DIFFERENT id than DrawA
  - DrawA completely deleted
  - No duplicate draws

Assertion:
  newDraw.id !== oldDraw.id
  SELECT COUNT(*) FROM draws WHERE status="simulated" AND month=current → 1
```

---

## TEST SUITE 6: EDGE CASES

### Test Case 6.1: No Active Subscriptions

```
Setup:
  - Active subscriptions: 0
  - Current rollover: $1,000

Action:
  - POST /api/admin/draw/simulate

Expected Results:
  - totalPool calculation: 0 * 10 * 0.5 + 1000 = $1,000
  - Tier pools split correctly
  - No winners (no users)
  - Full rollover: $1,000 (AFTER PATCH)
```

### Test Case 6.2: Very Large Pool

```
Setup:
  - 100,000 active users
  - Pool: $500,000 + $1,000 rollover = $501,000

Expected Results:
  - No precision loss from toMoney()
  - All tiers calculated correctly
  - No integer overflow

Assertion:
  response.summary.accounting.pool_sum === 501000
  Math.abs(poolSum - expected) < 0.01
```

### Test Case 6.3: Very Small Pool

```
Setup:
  - 1 active user
  - Pool: $5 + $0 rollover

Expected Results:
  - Tier pools: $2.00, $1.75, $1.25
  - Rounding handled correctly

Assertion:
  tierPool5 = 5 * 0.4 = 2.00
  tierPool4 = 5 * 0.35 = 1.75
  tierPool3 = 5 * 0.25 = 1.25
```

### Test Case 6.4: Rounding Variance Accumulation

```
Setup:
  - Run simulation 12 times (one month each)
  - Track rounding variance each month

Expected Results:
  - Total variance across 12 months: < $0.50
  - No variance > $0.05 in any month
  - Consistent rounding behavior
```

---

## TEST SUITE 7: DATA VALIDATION (PATCHED)

### Test Case 7.1: Invalid Winning Numbers

```
Setup:
  - Manually set winning_numbers = null in DB

Action:
  - POST /api/admin/draw/publish

Expected Results (PATCHED):
  - Error response with status 500
  - Clear message: "Simulated draw has invalid winning_numbers"
  - Details include actual value: null

Before Patch (BUG):
  - draw would publish with null winning_numbers
```

### Test Case 7.2: Negative Total Pool

```
Setup:
  - Manually set total_prize_pool = -100 in DB

Action:
  - POST /api/admin/draw/publish

Expected Results (PATCHED):
  - Error response: "invalid total_prize_pool"
  - Details: "Expected non-negative finite number, got: -100"

Before Patch (BUG):
  - draw would publish with negative pool
```

### Test Case 7.3: NaN Rollover Amount

```
Setup:
  - Manually set rollover_amount_generated = NaN in DB

Action:
  - POST /api/admin/draw/publish

Expected Results (PATCHED):
  - Error response: "invalid rollover_amount_generated"
  - Draw not published

Before Patch (BUG):
  - Payment processing and accounting would break
```

---

## TEST SUITE 8: ACCOUNT RECONCILIATION

### Test Case 8.1: Accounting Equation Balances

```
Formula:
  Total Pool = Payouts + Rollover

For each simulation:
  totalPool = (payouts_1 + payouts_2 + ... + payoutsN) + rolloverGenerated

Results should always satisfy:
  Math.abs(totalPool - (totalPayouts + rollover)) < 0.01

Assertion:
  response.summary.accounting.total_distributed_plus_rollover === totalPool
```

### Test Case 8.2: Audit Trail Completeness

```
Expected in Response:
  ✓ published_at timestamp
  ✓ admin_user_id
  ✓ draw_id
  ✓ draw_date
  ✓ status_changed_from / to
  ✓ total_prize_pool value
  ✓ jackpot_rollover_to_next_month

Assertion:
  response.audit_trail has all 7 fields
  all timestamps in ISO format
  all IDs are UUIDs
```

---

## AUTOMATED TEST SCRIPT TEMPLATE

```bash
#!/bin/bash
# Run all tests sequentially

echo "🧪 Running Test Suite 1..."
npm test -- test/draw-types.test.ts

echo "🧪 Running Test Suite 2..."
npm test -- test/prize-pool.test.ts

echo "🧪 Running Test Suite 3..."
npm test -- test/division-by-zero.test.ts

echo "🧪 Running Test Suite 4..."
npm test -- test/rollover.test.ts

echo "🧪 Running Test Suite 5..."
npm test -- test/simulation-isolation.test.ts

echo "🧪 Running Test Suite 6..."
npm test -- test/edge-cases.test.ts

echo "🧪 Running Test Suite 7..."
npm test -- test/data-validation.test.ts

echo "🧪 Running Test Suite 8..."
npm test -- test/accounting.test.ts

echo "✅ All tests complete!"
```

---

## SIGN-OFF CRITERIA

All tests must pass before deploying:

- [ ] Suite 1: All 5 test cases pass (Draw Types)
- [ ] Suite 2: All 3 test cases pass (Prize Pool Math)
- [ ] Suite 3: All 4 test cases pass (Division by Zero)
- [ ] Suite 4: All 5 test cases pass (Jackpot Rollover) - **CRITICAL FIX VALIDATED**
- [ ] Suite 5: All 3 test cases pass (Simulation vs Publish)
- [ ] Suite 6: All 4 test cases pass (Edge Cases)
- [ ] Suite 7: All 3 test cases pass (Data Validation) - **PATCHED CODE VALIDATED**
- [ ] Suite 8: All 2 test cases pass (Accounting)
- [ ] Zero regressions (all old passing tests still pass)
- [ ] Performance: Simulate completes in < 5 seconds
- [ ] Performance: Publish completes in < 2 seconds

**Total Test Cases: 29**  
**Estimated Runtime: 10-15 minutes**

---

**Document Version:** 1.0  
**Last Updated:** March 26, 2026  
**Status:** Ready for QA Execution
