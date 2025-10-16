# Tournament Workflow Commands

## 📋 Complete Tournament Workflow (4 Steps)

### Step 1: Create Upcoming Tournament
```bash
npm run tournament:create
```
Creates a tournament with UPCOMING status and reward pool.

---

### Step 2: Start Tournament (when match is about to begin)
```bash
npm run tournament:start -- <tournament-id>
```
Changes status to ONGOING and takes pre-match snapshot.

**Helper command:**
```bash
npm run tournament:list
```
Lists all tournaments with their IDs and status.

---

### Step 3: Update Player Scores

**Option A: Use hardcoded sample data**
```bash
npm run scores:update <tournament-id>
```

**Option B: Fetch real scores from Cricbuzz API**
```bash
npm run scores:fetch-api -- <tournament-id> <match-id>
```
Example: `npm run scores:fetch-api -- 425e92bf-cde4-40c0-95d1-84ac558d2590 130179`

**View current scores:**
```bash
npm run scores:get <tournament-id>
```

---

### Step 4: End Tournament
```bash
npm run tournament:end -- <tournament-id> --amount 100
```
Takes post-match snapshot, calculates rewards, distributes BOSON tokens, and completes tournament.

The `--amount` flag is optional. If not provided, it uses the existing reward pool amount.

---

## 🎯 Example Complete Workflow

```bash
# 1. Create tournament
npm run tournament:create
# Copy the tournament ID from output

# 2. Start tournament (when match begins)
npm run tournament:start -- 425e92bf-cde4-40c0-95d1-84ac558d2590

# 3. Update scores (after/during match)
npm run scores:fetch-api -- 425e92bf-cde4-40c0-95d1-84ac558d2590 130179

# 4. End tournament (after match completes)
npm run tournament:end -- 425e92bf-cde4-40c0-95d1-84ac558d2590 --amount 100
```

---

## 🛠️ Additional Commands

### Database Management
```bash
npm run prisma:generate   # Generate Prisma client
npm run prisma:migrate    # Run database migrations
npm run prisma:studio     # Open Prisma Studio GUI
```

### Development
```bash
npm run dev              # Start development server
npm run build            # Build TypeScript
```

### Testing
```bash
npm test                 # Run Jest tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage
```

---

## 📝 Notes

- All tournament IDs are UUIDs - copy them from the script output
- Match IDs are from Cricbuzz (find them in the URL of cricket matches)
- Reward amounts are in BOSON tokens
- Pre-match snapshots capture blockchain state before the match
- Post-match snapshots capture final holdings for reward calculation
