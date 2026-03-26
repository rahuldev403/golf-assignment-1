# 🔧 PATCHED CODE - KEY CHANGES GUIDE

This document highlights the critical fixes applied to your draw simulation and publishing routes.

---

## FIX #1: CRITICAL - Unclaimed Tier Pools Rollover

### ❌ ORIGINAL CODE (BUGGY)

```typescript
const rolloverAmountGenerated = winnersByTier[5].length === 0 ? tierPool5 : 0;
// Only tier 5 rolls over! Tier 4 & 3 pools vanish if no winners.
```

### ✅ PATCHED CODE

```typescript
const rolloverAmountGenerated = toMoney(
  (winnersByTier[5].length === 0 ? tierPool5 : 0) +
    (winnersByTier[4].length === 0 ? tierPool4 : 0) +
    (winnersByTier[3].length === 0 ? tierPool3 : 0),
);
// All unclaimed tier pools roll over to next month
```

### Impact:

- ✓ No more lost money in the system
- ✓ Full accounting transparency
- ✓ Prevents $350+ monthly discrepancies

---

## FIX #2: MEDIUM - Draw Data Validation (Publish Route)

### ❌ ORIGINAL CODE (UNSAFE)

```typescript
const { data: simulatedDraw } = await serviceDb
  .from("draws")
  .select("id, status, draw_date, winning_numbers, total_prize_pool...")
  .eq("status", "simulated")
  .limit(1)
  .maybeSingle();

if (!simulatedDraw) {
  return jsonError("No simulated draw found to publish.", 404);
}

// PROBLEM: No validation that fields are non-null!
return NextResponse.json({
  draw: publishedDraw, // winning_numbers could be null!
});
```

### ✅ PATCHED CODE

```typescript
const { data: simulatedDraw } = await serviceDb
  .from("draws")
  .select("id, status, draw_date, winning_numbers, total_prize_pool...")
  .eq("status", "simulated")
  .limit(1)
  .maybeSingle();

if (!simulatedDraw) {
  return jsonError("No simulated draw found to publish.", 404);
}

// NEW: Validate draw data is complete and valid
if (
  !Array.isArray(simulatedDraw.winning_numbers) ||
  simulatedDraw.winning_numbers.length !== 5
) {
  return jsonError(
    "Simulated draw has invalid winning_numbers.",
    500,
    `Expected array of 5 numbers, got: ${JSON.stringify(simulatedDraw.winning_numbers)}`,
  );
}

if (
  !Number.isFinite(simulatedDraw.total_prize_pool) ||
  simulatedDraw.total_prize_pool < 0
) {
  return jsonError(
    "Simulated draw has invalid total_prize_pool.",
    500,
    `Expected non-negative finite number, got: ${simulatedDraw.total_prize_pool}`,
  );
}

if (
  !Number.isFinite(simulatedDraw.rollover_amount_generated) ||
  simulatedDraw.rollover_amount_generated < 0
) {
  return jsonError(
    "Simulated draw has invalid rollover_amount_generated.",
    500,
    `Expected non-negative finite number, got: ${simulatedDraw.rollover_amount_generated}`,
  );
}

// SAFE: All data validated before proceeding
```

### Impact:

- ✓ Prevents null/invalid data from being published
- ✓ Clear error messages for debugging
- ✓ Type safety at runtime

---

## FIX #3: MEDIUM - Winner Count Verification (Simulate Route)

### ❌ ORIGINAL CODE (NO VERIFICATION)

```typescript
if (winnersToInsert.length > 0) {
  const { error: winnersInsertError } = await serviceDb
    .from("winners")
    .insert(winnersToInsert);

  if (winnersInsertError) {
    await serviceDb.from("draws").delete().eq("id", insertedDraw.id);
    return jsonError(
      "Failed to insert winners.",
      500,
      winnersInsertError.message,
    );
  }
  // PROBLEM: Doesn't verify all winners were actually inserted!
}
```

### ✅ PATCHED CODE

```typescript
if (winnersToInsert.length > 0) {
  const { error: winnersInsertError } = await serviceDb
    .from("winners")
    .insert(winnersToInsert);

  if (winnersInsertError) {
    await serviceDb.from("draws").delete().eq("id", insertedDraw.id);
    return jsonError(
      "Failed to insert winners.",
      500,
      winnersInsertError.message,
    );
  }

  // NEW: Verify all winners were inserted
  const { count: insertedWinnerCount, error: countError } = await serviceDb
    .from("winners")
    .select("id", { count: "exact", head: true })
    .eq("draw_id", insertedDraw.id);

  if (
    countError ||
    insertedWinnerCount === null ||
    insertedWinnerCount !== winnersToInsert.length
  ) {
    // Rollback if count doesn't match
    await serviceDb.from("draws").delete().eq("id", insertedDraw.id);
    await serviceDb.from("winners").delete().eq("draw_id", insertedDraw.id);
    return jsonError(
      "Winner insertion verification failed.",
      500,
      `Expected ${winnersToInsert.length} winners, verified ${insertedWinnerCount}`,
    );
  }
}
```

### Impact:

- ✓ Catches partial insert failures
- ✓ Prevents incomplete draw data
- ✓ Full rollback on mismatch

---

## FIX #4: LOW - Generate Numbers Validation

### ❌ ORIGINAL CODE (INFINITE LOOP RISK)

```typescript
function generateUniqueDrawNumbers(
  total: number,
  min: number,
  max: number,
): number[] {
  const values = new Set<number>();

  while (values.size < total) {
    values.add(Math.floor(Math.random() * (max - min + 1)) + min);
  }
  // PROBLEM: If total > (max - min + 1), infinite loop!

  return Array.from(values).sort((a, b) => a - b);
}
```

### ✅ PATCHED CODE

```typescript
function generateUniqueDrawNumbers(
  total: number,
  min: number,
  max: number,
): number[] {
  // NEW: Validate parameters
  if (total > max - min + 1) {
    throw new Error(
      `Cannot generate ${total} unique numbers between ${min} and ${max}`,
    );
  }

  const values = new Set<number>();

  while (values.size < total) {
    values.add(Math.floor(Math.random() * (max - min + 1)) + min);
  }

  return Array.from(values).sort((a, b) => a - b);
}
```

### Impact:

- ✓ Prevents infinite loops
- ✓ Clear error if function misused

---

## FIX #5: ENHANCEMENT - Comprehensive Audit Trail

### ❌ ORIGINAL CODE (MINIMAL INFO)

```typescript
return NextResponse.json(
  {
    success: true,
    draw: insertedDraw,
    summary: {
      winning_numbers: winningNumbers,
      total_pool: totalPool,
      winners_count: { match_5: ..., match_4: ..., match_3: ... },
      // Limited data for auditing
    },
  },
  { status: 200 },
);
```

### ✅ PATCHED CODE

```typescript
return NextResponse.json(
  {
    success: true,
    draw: insertedDraw,
    summary: {
      winning_numbers: winningNumbers,
      total_pool: totalPool,
      winners_count: {
        match_5: winnersByTier[5].length,
        match_4: winnersByTier[4].length,
        match_3: winnersByTier[3].length,
        total: winnersToInsert.length,
      },
      tier_pools: {
        match_5: tierPool5,
        match_4: tierPool4,
        match_3: tierPool3,
      },
      unclaimed_tiers: {
        match_5: winnersByTier[5].length === 0 ? tierPool5 : 0,
        match_4: winnersByTier[4].length === 0 ? tierPool4 : 0,
        match_3: winnersByTier[3].length === 0 ? tierPool3 : 0,
      },
      payouts_each: {
        match_5: prizeEach5,
        match_4: prizeEach4,
        match_3: prizeEach3,
      },
      rollover: {
        previous: currentRollover,
        generated: rolloverAmountGenerated,
        next: rolloverAmountGenerated,
        note: "Rollover includes all unclaimed tier pools (5, 4, and 3-match)",
      },
      accounting: {
        pool_sum: poolSum,
        total_payouts: toMoney(
          prizeEach5 * winnersByTier[5].length +
            prizeEach4 * winnersByTier[4].length +
            prizeEach3 * winnersByTier[3].length,
        ),
        total_distributed_plus_rollover: toMoney(
          prizeEach5 * winnersByTier[5].length +
            prizeEach4 * winnersByTier[4].length +
            prizeEach3 * winnersByTier[3].length +
            rolloverAmountGenerated,
        ),
      },
    },
  },
  { status: 200 },
);
```

### Publish Route Enhancement:

```typescript
return NextResponse.json(
  {
    success: true,
    message: "Draw published successfully.",
    draw: publishedDraw,
    winners_published: winnerCount ?? 0,
    rollover_applied_for_next_month: rolloverAmount,
    audit_trail: {
      published_at: new Date().toISOString(),
      admin_user_id: user.id,
      draw_id: publishedDraw.id,
      draw_date: publishedDraw.draw_date,
      status_changed_from: "simulated",
      status_changed_to: "published",
      total_prize_pool: publishedDraw.total_prize_pool,
      jackpot_rollover_to_next_month: rolloverAmount,
    },
  },
  { status: 200 },
);
```

### Impact:

- ✓ Full financial transparency for audits
- ✓ Easy to track money through system
- ✓ Debugging made easier for QA/admins

---

## DEPLOYMENT INSTRUCTIONS

### Step 1: Backup Original Code

```bash
cp app/api/admin/draw/simulate/route.ts app/api/admin/draw/simulate/route.ORIGINAL.ts
cp app/api/admin/draw/publish/route.ts app/api/admin/draw/publish/route.ORIGINAL.ts
```

### Step 2: Deploy Patched Routes

```bash
cp app/api/admin/draw/simulate/route.PATCHED.ts app/api/admin/draw/simulate/route.ts
cp app/api/admin/draw/publish/route.PATCHED.ts app/api/admin/draw/publish/route.ts
```

### Step 3: Run Test Suite

```bash
npm run test:draw-simulation
npm run test:draw-publish
```

### Step 4: Verify Database

```sql
-- Check for any null winning_numbers
SELECT id FROM draws WHERE winning_numbers IS NULL;

-- Verify rollover amounts for last 3 months
SELECT draw_date, status, rollover_amount_generated FROM draws
WHERE draw_date >= DATE_SUB(NOW(), INTERVAL 3 MONTH)
ORDER BY draw_date DESC;
```

### Step 5: Production Rollout

1. Deploy to staging environment
2. Run full test matrix
3. Compare accounting reports before/after
4. Deploy to production with admin notification
5. Monitor admin dashboard for any errors

---

## VERIFICATION CHECKLIST

After deploying patched code:

- [ ] Existing published draws remain unchanged
- [ ] Last month's rollover correctly applied to new simulation
- [ ] Division by zero never occurs (test with 0 winners per tier)
- [ ] System settings rollover updates correctly
- [ ] Winners table has correct count and prize amounts
- [ ] Simulation can be re-run without errors
- [ ] Publish successfully transitions draw to published
- [ ] Future month's rollover includes unclaimed tier 4 & 3 pools

---

## REGRESSION TEST CASES

Run these tests before and after deployment to ensure no regressions:

### Test Case 1: Normal Scenario

```
activeUsers: 100
pool: $1,000
Winners: 2 (tier 5), 1 (tier 4), 3 (tier 3)
Expected:
  - Tier 5: $400 / 2 = $200 each
  - Tier 4: $350 / 1 = $350 each
  - Tier 3: $250 / 3 = $83.33 each
  - Rollover: $0
```

### Test Case 2: Full Rollover

```
activeUsers: 100
pool: $1,000
Winners: 0 (all tiers)
Expected:
  - Rollover: $1,000 (INCLUDING tier 4 & 3)
  - Next month's pool includes this $1,000
```

### Test Case 3: Mixed Unclaimed

```
activeUsers: 100
pool: $1,000
Winners: 2 (tier 5), 0 (tier 4), 1 (tier 3)
Expected:
  - Tier 5: $200 each (no rollover)
  - Tier 4: ROLLOVER $350
  - Tier 3: $250 each (no rollover)
  - Total rollover: $350
```

---

## SUPPORT CONTACTS

If issues arise after deployment:

1. **Accounting Discrepancy:** Check unclaimed_tiers in simulation response
2. **Division by Zero Error:** Should not occur; check test matrix
3. **Corruption:** Rollback to ORIGINAL versions and investigate
4. **Performance Issues:** Check witness count > 10,000 users

---

**Last Updated:** March 26, 2026  
**Patch Version:** 2.0-CRITICAL  
**Status:** Ready for Production Deployment
