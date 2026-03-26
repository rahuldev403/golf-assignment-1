# 🔍 QA AUDIT REPORT: Draw Simulation & Publishing API Routes

**Audit Date:** March 26, 2026  
**Auditor:** Senior QA Engineer  
**Project:** Golf Platform - Monthly Draw System  
**Severity Summary:** 1 CRITICAL | 2 MEDIUM | 3 LOW

---

## EXECUTIVE SUMMARY

The draw simulation and publishing API routes demonstrate solid foundational architecture with proper authentication, error handling, and division-by-zero protection. However, a **critical accounting bug** causes unclaimed tier pools (4 and 3-match prizes) to vanish from the system when there are zero winners in those tiers. This represents a loss of **25-35% of the prize pool** in many scenarios.

**Financial Impact:** If a typical draw has $1,000 pool and no 4-match winners → $350 lost with no audit trail.

---

## REQUIREMENTS VERIFICATION MATRIX

| Requirement                                      | Status  | Evidence                                                               |
| ------------------------------------------------ | ------- | ---------------------------------------------------------------------- |
| **Req 1:** Identify 5/4/3-number draws correctly | ✅ PASS | Match counting logic correctly categorizes only exact 3, 4, 5 matches  |
| **Req 2:** Prize pool split (40/35/25%)          | ✅ PASS | Tier pools = totalPool × 0.4/0.35/0.25; math verified to 100%          |
| **Req 3:** Division-by-zero safeguards           | ✅ PASS | All three tiers check `winnersByTier[tier].length > 0` before division |
| **Req 4:** Jackpot rollover (Tier 5)             | ✅ PASS | 40% rolls over if no 5-match winners; saved to system_settings         |
| **Req 5:** Simulation vs Publish isolation       | ✅ PASS | Simulate filters `status: "simulated"` only; published draws untouched |

---

## 🚨 CRITICAL FINDINGS

### CRITICAL BUG #1: Unclaimed Tier Pools (4 & 3) Lost to System

**Location:** `app/api/admin/draw/simulate/route.ts`, lines 240-247

**Problem:**

```typescript
// Current code only rolls over tier 5
const rolloverAmountGenerated = winnersByTier[5].length === 0 ? tierPool5 : 0; // ← Tier 4 & 3 not handled!

// Tier 4 & 3 pools just vanish if no winners:
const prizeEach4 =
  winnersByTier[4].length > 0
    ? toMoney(tierPool4 / winnersByTier[4].length)
    : 0; // ← If no tier 4 winners, $350 disappears
```

**Scenario (Financial Impact):**

```
Total Pool: $1,000 (500 active subscribers × $10 × 0.5)
  ├─ Tier 5 pool: $400 (40%)
  │  ├─ Winners: 0 people
  │  └─ Rollover: $400 ✓ (handled correctly)
  │
  ├─ Tier 4 pool: $350 (35%)
  │  ├─ Winners: 0 people
  │  └─ Rollover: $0 ✗ (BUG - lost forever!)
  │
  └─ Tier 3 pool: $250 (25%)
     ├─ Winners: 3 people
     └─ Payout: $83.33 each ✓

Missing: $350 in accounting system
```

**Business Impact:**

- Money is permanently lost from the system with no audit trail
- Over 12 months with 50/50 chance of no winners per tier: ~$2,100 missing
- Creates suspicious account ledger discrepancies
- May require manual accounting adjustments

**Fix Applied:**

```typescript
// NEW: Roll over ALL unclaimed tier pools
const rolloverAmountGenerated = toMoney(
  (winnersByTier[5].length === 0 ? tierPool5 : 0) +
    (winnersByTier[4].length === 0 ? tierPool4 : 0) +
    (winnersByTier[3].length === 0 ? tierPool3 : 0),
);
```

**Testing Required:**

- [ ] Zero winners in tier 4: verify $350 rolls over
- [ ] Zero winners in tier 3: verify $250 rolls over
- [ ] Zero winners in all tiers: verify all $1,000 rolls over
- [ ] Verify rollover appears in `system_settings.current_jackpot_rollover`
- [ ] Verify response includes breakdown of unclaimed tiers

---

## 🟠 MEDIUM SEVERITY FINDINGS

### MEDIUM BUG #2: No Validation of Draw Data Completeness

**Location:** `app/api/admin/draw/publish/route.ts`, lines 40-60

**Problem:**

```typescript
const { data: simulatedDraw } = await serviceDb
  .from("draws")
  .select(
    "id, status, draw_date, winning_numbers, total_prize_pool, rollover_amount_generated",
  )
  .eq("status", "simulated")
  .limit(1)
  .maybeSingle();

// No validation that these fields are non-null!
return NextResponse.json({
  draw: simulatedDraw, // ← Could have null fields
});
```

**Problem Scenario:**

- If `winning_numbers` is null → client receives null array
- If `total_prize_pool` is null → API should fail, not return partial data
- No type safety at runtime

**Fix Applied:**

```typescript
// Validate draw data completeness before proceeding
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
```

**Testing Required:**

- [ ] Manually set `winning_numbers = null` in DB, call publish, verify error
- [ ] Set `total_prize_pool = -100`, call publish, verify error
- [ ] Set `rollover_amount_generated = NaN`, call publish, verify error

---

### MEDIUM BUG #3: Rounding Precision Loss Creates Unaccounted Dollars

**Location:** `app/api/admin/draw/simulate/route.ts`, lines 27-29

**Problem:**

```typescript
function toMoney(value: number): number {
  return Number(value.toFixed(2));
}

// Usage in payout calculation:
const prizeEach5 = toMoney(tierPool5 / winnersByTier[5].length);

// Example: $400 / 3 winners = $133.333...
// Rounds to $133.33 per person
// Payout: $133.33 × 3 = $399.99
// Missing: $0.01
```

**Scenario (Cumulative Loss):**

- Monthly loss per tier: $0.01 - $0.03
- Across 3 tiers: ~$0.05/month
- Annually: ~$0.60
- Over 3 years: ~$2.00

This is actually **standard lottery practice** (rounding creates house edge), but should be documented.

**Audit Trail Recommendation:**

```typescript
// In response, include accounting reconciliation:
accounting: {
  total_payouts: 999.99,
  rollover: 0.01,
  total_distributed_plus_rollover: 1000.00,
  variance: 0,
  note: "Rounding may create $0-0.03 variance per tier (standard practice)"
}
```

**Testing Required:**

- [ ] Run simulation with pool = $1,000, tier 5 = 3 winners, verify payout math
- [ ] Over 10 simulations, track cumulative rounding variance

---

## 🟡 LOW SEVERITY FINDINGS

### LOW #1: No Active Subscriptions Edge Case

**Location:** `app/api/admin/draw/simulate/route.ts`, lines 173-175

**Scenario:**

```typescript
const activeUserIds = []; // Empty array
const totalPool = toMoney(
  0 * 10 * 0.5 + currentRollover, // totalPool = currentRollover
);

const tierPool5 = toMoney(totalPool * 0.4);
// If currentRollover = $1,000, tierPool5 = $400
// Only 40% of rollover is allocated; 60% disappears!
```

**Business Logic Question:** If there are no active subscribers (no new revenue), the entire rollover should carry forward untouched, not get re-split.

**Recommendation:**

```typescript
if (activeUserIds.length === 0) {
  // No new revenue; rollover carries forward 100%
  const rolloverAmountGenerated = currentRollover;
  // Log warning: "No active subscribers; rollover carried forward"
}
```

**Testing Required:**

- [ ] No active subscriptions + $1,000 rollover → rollover should be $1,000, not $400
- Would require discussion with product ownership to confirm expected behavior

---

### LOW #2: Missing Draw Number Validation

**Location:** `app/api/admin/draw/simulate/route.ts`, lines 45-60

**Current:**

```typescript
function generateUniqueDrawNumbers(total: number, min: number, max: number) {
  const values = new Set<number>();
  while (values.size < total) {
    values.add(Math.floor(Math.random() * (max - min + 1)) + min);
  }
  return Array.from(values).sort((a, b) => a - b);
}

// Called with (5, 1, 45) - always safe
const winningNumbers = generateUniqueDrawNumbers(5, 1, 45);
```

**Potential Risk:** If function is reused elsewhere with invalid parameters (e.g., `generateUniqueDrawNumbers(100, 1, 45)`), infinite loop results.

**Fix Applied:**

```typescript
function generateUniqueDrawNumbers(total: number, min: number, max: number) {
  if (total > max - min + 1) {
    throw new Error(
      `Cannot generate ${total} unique numbers between ${min} and ${max}`,
    );
  }
  // ... rest of function
}
```

**Testing Required:**

- [ ] Call with valid params (5, 1, 45) - succeeds
- [ ] Call with invalid params (100, 1, 45) - throws error

---

### LOW #3: Missing Winner Count Verification in Simulate

**Location:** `app/api/admin/draw/simulate/route.ts`, lines 260-280

**Current:**

```typescript
if (winnersToInsert.length > 0) {
  const { error: winnersInsertError } = await serviceDb
    .from("winners")
    .insert(winnersToInsert);

  if (winnersInsertError) {
    // Rollback
  }
}
// No verification that winners were actually inserted
```

**Better Practice:**

```typescript
if (winnersToInsert.length > 0) {
  const { error: winnersInsertError } = await serviceDb
    .from("winners")
    .insert(winnersToInsert);

  if (winnersInsertError) {
    await serviceDb.from("draws").delete().eq("id", insertedDraw.id);
    return jsonError(...);
  }

  // NEW: Verify all winners were inserted
  const { count: insertedWinnerCount } = await serviceDb
    .from("winners")
    .select("id", { count: "exact", head: true })
    .eq("draw_id", insertedDraw.id);

  if (insertedWinnerCount !== winnersToInsert.length) {
    // Rollback and error
  }
}
```

**Testing Required:**

- [ ] Simulate draw, verify winner count matches response
- [ ] Check DB directly to confirm count

---

## CODE QUALITY IMPROVEMENTS APPLIED

### 1. Enhanced Validation & Error Messages

```typescript
// Before: Generic error
if (drawInsertError) return jsonError("Failed to insert draw.", 500);

// After: Specific validation context
if (!insertedDraw.id || typeof insertedDraw.id !== "string") {
  return jsonError(
    "Draw inserted but returned invalid ID.",
    500,
    JSON.stringify(insertedDraw), // Include actual data for debugging
  );
}
```

### 2. Explicit Audit Trail in Responses

```typescript
return NextResponse.json({
  success: true,
  draw: publishedDraw,
  audit_trail: {
    published_at: new Date().toISOString(),
    admin_user_id: user.id,
    draw_id: publishedDraw.id,
    total_prize_pool: publishedDraw.total_prize_pool,
    jackpot_rollover_to_next_month: rolloverAmount,
  },
});
```

### 3. Accounting Reconciliation

```typescript
accounting: {
  pool_sum: poolSum,
  total_payouts: totalPayouts,
  total_distributed_plus_rollover: totalPayouts + rollover,
  variance: Math.abs(totalPool - (totalPayouts + rollover)),
},
```

---

## DEPLOYMENT CHECKLIST

### Before Deploying Patched Code:

- [ ] **Data Migration:** Current production draws have correct rollover amounts
- [ ] **Database Check:** Verify no draws have null `winning_numbers`
- [ ] **Accounting Audit:** Review last 3 months - identify any "missing" money from tier 4/3
- [ ] **Load Testing:** Simulate 1000+ active users to verify performance
- [ ] **QA Test Cases:** Run complete test matrix (see below)
- [ ] **Admin Notification:** Alert admins about accounting reconciliation

### Rollback Plan:

- If critical issue found, revert to original routes
- Manually reconcile missing tier 4/3 payouts from last draw
- Add monitoring for missing amounts

---

## COMPREHENSIVE TEST MATRIX

### Test Suite 1: Draw Types

```typescript
// TEST 1.1: Exactly 3-match winner
Winning: [1, 5, 10, 15, 20]
User scores: [1, 5, 10, 99, 88]  // 3 matches
Expected: winnersByTier[3] includes user_id

// TEST 1.2: Exactly 4-match winner
Winning: [1, 5, 10, 15, 20]
User scores: [1, 5, 10, 15, 99]  // 4 matches
Expected: winnersByTier[4] includes user_id

// TEST 1.3: Exactly 5-match winner
Winning: [1, 5, 10, 15, 20]
User scores: [1, 5, 10, 15, 20]  // 5 matches
Expected: winnersByTier[5] includes user_id

// TEST 1.4: No matches
Winning: [1, 5, 10, 15, 20]
User scores: [30, 31, 32, 33, 34]  // 0 matches
Expected: User not in any tier
```

### Test Suite 2: Prize Pool Math

```typescript
// TEST 2.1: Pool splits to 40/35/25
activeUsers: 100, total subscription revenue: $500
currentRollover: $500
totalPool: $750

tierPool5 = $300 ✓
tierPool4 = $262.50 ✓
tierPool3 = $187.50 ✓
sum: $750 ✓

// TEST 2.2: Individual prize calculation
tierPool5: $300, winners: 3
prizeEach5: $300 / 3 = $100 ✓

// TEST 2.3: Zero winner per tier
tierPool5: $300, winners: 0
prizeEach5: 0 ✓ (no division by zero)
```

### Test Suite 3: Rollover Calculation

```typescript
// TEST 3.1: Tier 5 no winners → rollover 40%
activeUsers: 100, pool: $1,000
winnersByTier[5].length: 0
rolloverGenerated: $400 ✓

// TEST 3.2: All tiers no winners → rollover 100% (PATCHED)
activeUsers: 100, pool: $1,000
winnersByTier: 0 for all
rolloverGenerated: $1,000 ✓ (including tier 4 & 3)

// TEST 3.3: Mixed winners
tierPool5: $400, winners: 2 (keeps $0)
tierPool4: $350, winners: 0 (rolls $350)
tierPool3: $250, winners: 1 (keeps $0, pays $250)
rolloverGenerated: $350 ✓
```

### Test Suite 4: Simulation Isolation

```typescript
// TEST 4.1: Delete only simulated draws
[Setup]: 2 simulated draws + 1 published draw in same month
[Action]: Call simulate to create new draw
[Expected]:
  - Old simulated draws deleted ✓
  - Published draw remains (3 → 2 draws total)

// TEST 4.2: Delete associated winners only
[Setup]: DrawA (simulated) with 10 winners
[Action]: Call simulate to create DrawB
[Expected]:
  - DrawB inserted ✓
  - DrawA deleted ✓
  - 10 winners deleted ✓
```

---

## DEPLOYMENT RISK MATRIX

| Risk                                      | Probability | Severity | Mitigation                       |
| ----------------------------------------- | ----------- | -------- | -------------------------------- |
| Existing draw data has null fields        | Low         | Critical | Validate DB before deploying     |
| Tier 4/3 rollover creates duplicate money | Low         | Medium   | Compare DB rollover before/after |
| Rounding variance accumulates too much    | Very Low    | Low      | Monitor over 1 month             |
| No subscribers edge case fails            | Low         | Medium   | Add test for zero active users   |

---

## SIGN-OFF

**Audit Completed:** March 26, 2026  
**Auditor:** Senior QA Engineer  
**Status:** READY FOR PATCHING (Deploy patched routes after test matrix completed)

**Recommendation:** Apply all patches immediately. The critical rollover bug requires urgent fix before next monthly draw simulation.
