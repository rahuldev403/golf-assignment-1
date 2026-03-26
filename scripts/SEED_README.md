# Seeding Charities Data

This script adds sample charity data to your Supabase database.

## Prerequisites

Make sure you have:

1. Your `.env.local` file configured with Supabase credentials
2. Node.js installed (v16+)

## Required Environment Variables

Your `.env.local` must contain:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Running the Script

### Option 1: Using npm (from project root)

```bash
npm run seed:charities
```

### Option 2: Using node directly

```bash
node scripts/seed-charities.mjs
```

## What the Script Does

The script will:

1. Load environment variables from `.env.local`
2. Check if charities already exist in the database
3. If not, insert 10 charities with:
   - Name and description
   - Category (Education, Environment, Health)
   - High-quality images from Unsplash
   - Featured status

## Sample Data

The script seeds:

- **Global Education Initiative** (Education) - Featured
- **Ocean Conservation Alliance** (Environment)
- **Healthcare for All** (Health)
- **Renewable Energy Foundation** (Environment)
- **Youth Mentorship Network** (Education)
- **Community Health Outreach** (Health)
- **Reforestation Initiative** (Environment)
- **Women in STEM Foundation** (Education)
- **Mental Health First** (Health)
- **Urban Gardens Project** (Environment)

## Adding the Script to package.json

If you want to use `npm run seed:charities`, add this to your `package.json`:

```json
{
  "scripts": {
    "seed:charities": "node scripts/seed-charities.mjs"
  }
}
```

## Troubleshooting

### Missing environment variables

```
Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY
```

Solution: Check your `.env.local` file has both variables set.

### Charities already exist

The script will skip seeding if charities are already in the database to avoid duplicates.
To re-seed, delete existing charities from Supabase first.

### Error connecting to Supabase

Make sure your `SUPABASE_SERVICE_ROLE_KEY` is correct and not expired.
