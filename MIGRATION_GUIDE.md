# Database Migration Guide

This guide explains how to migrate your database with the updated schema while preserving all existing data.

## What Changed

### Schema Updates
1. **Snapshot Model**:
   - Changed from `ContractSnapshot` to `Snapshot`
   - `contractType` → `snapshotType` (enum: `PRE_MATCH`, `POST_MATCH`)
   - Added `tournamentId` as a direct field (instead of storing in JSON)
   - Added foreign key relationship to `Tournament`
   - Added unique constraint on `[tournamentId, snapshotType]`

2. **Tournament Model**:
   - `rewardPools` changed from array (`RewardPool[]`) to single object (`RewardPool?`)
   - One-to-one relationship with `RewardPool`

3. **Removed Fields**:
   - Removed `entryFee` from `Tournament` model

## Migration Options

### Option 1: Automated Migration (Recommended)

Run the complete migration script that handles everything:

```bash
npm run db:migrate-with-data
```

This will:
1. ✅ Export all your current data to `/backups`
2. ✅ Reset database with new schema
3. ✅ Transform and import your data
4. ✅ Preserve a backup in case something goes wrong

### Option 2: Manual Migration (More Control)

If you prefer to run each step manually:

#### Step 1: Export Current Data
```bash
npm run db:export
```

This creates a backup in `/backups/backup-<timestamp>/` with:
- `tournaments.json`
- `player-scores.json`
- `reward-pools.json`
- `user-rewards.json`
- `snapshots.json`
- `users.json`
- `summary.json`

#### Step 2: Reset Database
```bash
npx prisma migrate reset --force
```

#### Step 3: Import Data
```bash
# Import latest backup
npm run db:import

# Or specify a backup directory
npm run db:import /path/to/backup/directory
```

## Data Transformation

The import script automatically transforms:

### Snapshots
```javascript
// Before (old schema)
{
  id: "...",
  contractType: "PRE_MATCH",
  data: {
    tournamentId: "abc123",
    snapshotType: "PRE_MATCH",
    // ... snapshot data
  }
}

// After (new schema)
{
  id: "...",
  tournamentId: "abc123",  // ← Extracted to separate field
  snapshotType: "PRE_MATCH",  // ← Renamed from contractType
  data: {
    tournamentId: "abc123",
    snapshotType: "PRE_MATCH",
    // ... snapshot data (kept for backwards compatibility)
  }
}
```

### Tournament Reward Pools
```javascript
// Before
tournament.rewardPools = [pool1, pool2]  // Array

// After
tournament.rewardPools = pool1  // Single object (or null)
```

## Backup Location

All backups are stored in: `/backups/backup-<ISO-timestamp>/`

Example: `/backups/backup-2025-01-15T10-30-00-000Z/`

## Verification

After migration, verify your data:

```bash
# Check tournaments
npm run tournament:list

# Check snapshots via API
curl http://localhost:3000/api/snapshots

# Check rewards
curl http://localhost:3000/api/rewards
```

## Rollback

If something goes wrong, you can manually restore from backup:

1. Keep the backup directory safe
2. Reset database again: `npx prisma migrate reset --force`
3. Import from backup: `npm run db:import /path/to/backup`

## Troubleshooting

### "Pre-match snapshot not found"
The old code stored `tournamentId` in JSON. After migration, it uses a dedicated field.
If you see this error, make sure you ran the import script.

### "ContractType is not exported"
Update imports:
```typescript
// Old
import { ContractType } from '@prisma/client';

// New
import { SnapshotType } from '@prisma/client';
```

### "contractSnapshot is not defined"
Update Prisma calls:
```typescript
// Old
prisma.contractSnapshot.findMany()

// New
prisma.snapshot.findMany()
```

## Support

If you encounter issues:
1. Check backup location: `/backups/`
2. Review logs during import
3. Verify Prisma client is regenerated: `npx prisma generate`

## Migration Scripts

- `src/scripts/export-data.ts` - Export all database data
- `src/scripts/import-data.ts` - Import and transform data
- `src/scripts/migrate-database.ts` - Complete automated workflow

## Updated Code Files

The following files have been updated to work with the new schema:
- `src/services/contractSnapshotService.ts`
- `src/services/rewardCalculationService.ts`
- `src/scripts/end-tournament.ts`
- `src/scripts/start-tournament.ts`
- `src/scripts/create-tournament.ts`
- `src/controllers/rewards.controller.ts`
- `src/controllers/snapshots.controller.ts`

