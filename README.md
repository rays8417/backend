# 🏏 Cricket Fantasy Backend API

A comprehensive backend API for cricket fantasy sports application on Aptos blockchain, featuring centralized tournament and reward management with real-time cricket data integration.

## 📋 Table of Contents
- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [API Documentation](#-api-documentation)
- [Cricket API Integration](#-cricket-api-integration)
- [Tournament Testing Guide](#-tournament-testing-guide)
- [User Rewards API](#-user-rewards-api)
- [Testing](#-testing)
- [Fantasy Scoring System](#-fantasy-scoring-system)
- [Database Schema](#-database-schema)

---

## 🚀 Features

- **User Management**: Petra wallet authentication with auto-registration
- **Tournament System**: One-match-per-tournament with centralized management
- **Team Creation**: Fantasy team creation with captain/vice-captain system
- **Real-time Scoring**: Cricket-specific fantasy point calculation
- **Cricket API Integration**: Automatic score fetching from Cricbuzz API
- **Reward Distribution**: Flexible reward pool management with Aptos blockchain integration
- **Admin Panel**: Complete admin controls for tournaments, players, and rewards
- **Leaderboards**: Real-time tournament rankings and statistics
- **Contract Snapshots**: Pre/post-match blockchain state tracking
- **Live Score Updates**: Polling mechanism for ongoing matches

---

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL database
- npm or yarn
- RapidAPI key for Cricbuzz API (for live scores)
- Aptos wallet (for blockchain integration)

---

## 🛠️ Installation

### 1. Clone and install dependencies
```bash
npm install
```

### 2. Set up environment variables
Create a `.env` file in the backend directory:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/cricket_fantasy_db"

# Server
PORT=3000

# Aptos Blockchain
APTOS_NETWORK="testnet"
APTOS_CONTRACT_ADDRESS="0xYOUR_CONTRACT_ADDRESS_HERE"

# Admin account for reward distribution
ADMIN_PRIVATE_KEY="1,2,3,4,..." # Comma-separated bytes
ADMIN_ACCOUNT_ADDRESS="0xYOUR_ADMIN_ADDRESS"

# Cricket API (RapidAPI - Cricbuzz)
RAPIDAPI_KEY="your-rapidapi-key-here"

# Ignored holder addresses (comma-separated)
# Example: Pool addresses, treasury, etc.
IGNORED_HOLDER_ADDRESSES="0x11111,0x22222"

# Reward token configuration
BOSON_COIN_TYPE="0xYOUR_CONTRACT::Boson::Boson"
BOSON_DECIMALS=8
```

### 3. Set up database
```bash
# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# (Optional) Open Prisma Studio
npm run prisma:studio
```

### 4. Start the development server
```bash
npm run dev
```

---

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication
All user authentication is handled via Petra wallet. Users are automatically created on first login.

---

## 👤 User Routes (`/api/users`)

### POST `/track`
Track wallet connection for metrics
```json
{
  "address": "0x1234..."
}
```

### GET `/count`
Get total unique users count

---

## 🏆 Tournament Routes (`/api/tournaments`)

### GET `/`
Get all tournaments with filters
- Query params: `status`, `limit`, `offset`

### GET `/:id`
Get tournament details with player scores and reward pools

### GET `/:id/players`
Get available players for tournament (from database)

### GET `/:id/eligible-players`
Get eligible players from Cricbuzz API with holdings (if address provided)
- Query params: `address` (optional)

---

## 📊 Scoring Routes (`/api/scoring`)

### POST `/player-scores`
Update player scores (Admin only)
```json
{
  "tournamentId": "tournament-id",
  "playerScores": [
    {
      "moduleName": "ViratKohli",
      "runs": 50,
      "ballsFaced": 30,
      "wickets": 2,
      "oversBowled": 4.0,
      "runsConceded": 20,
      "catches": 1,
      "stumpings": 0,
      "runOuts": 1
    }
  ]
}
```

### POST `/calculate-user-scores`
Calculate user scores based on contract holdings and player performance

### GET `/tournament/:tournamentId/scores`
Get all scores for a tournament

---

## 📸 Snapshot Routes (`/api/snapshots`)

### POST `/create`
Create contract snapshot (PRE_MATCH or POST_MATCH)
```json
{
  "tournamentId": "tournament-id",
  "snapshotType": "PRE_MATCH",
  "useAptosData": true
}
```

### GET `/tournament/:tournamentId`
Get all snapshots for a tournament

### POST `/compare-pre-post`
Compare pre-match and post-match snapshots
```json
{
  "tournamentId": "tournament-id"
}
```

### GET `/aptos-holders`
Get current Aptos token holders from contract

### GET `/aptos-holders/:moduleName`
Get holders for specific player module

---

## 💰 Reward Routes (`/api/rewards`)

### POST `/calculate-snapshot-based`
Calculate rewards based on snapshot data (no distribution)
```json
{
  "tournamentId": "tournament-id",
  "totalRewardAmount": 100
}
```

### POST `/distribute-contract-based`
Calculate and distribute rewards via Aptos transactions
```json
{
  "tournamentId": "tournament-id",
  "totalRewardAmount": 100
}
```

### GET `/eligibility/:tournamentId/:address`
Check reward eligibility for an address

### GET `/summary/:tournamentId`
Get reward summary for a tournament

### GET `/admin-info`
Get admin account information and balance

### POST `/create-pool`
Create reward pool (Admin only)

### GET `/tournament/:tournamentId`
Get reward pools for tournament

### GET `/user/:walletAddress`
Get user's rewards

---

## 🔴 Live Scores Routes (`/api/live-scores`)

### GET `/:tournamentId`
Get live scores for ongoing tournament
- Query params: `startPolling=true`, `intervalMinutes=5`

### POST `/:tournamentId/start-polling`
Start automatic polling for live scores
```json
{
  "intervalMinutes": 5
}
```

### POST `/:tournamentId/stop-polling`
Stop polling for live scores

### GET `/`
Get polling status for all tournaments

### GET `/:tournamentId/leaderboard`
Get live leaderboard with user scores

### GET `/discover/live-matches`
Discover all currently live matches from Cricbuzz

### GET `/discover/match/:matchId`
Check if a specific match is live

---

## 🔧 Admin Routes (`/api/admin`)

### POST `/tournaments`
Create tournament
```json
{
  "name": "India vs Australia - T20 World Cup",
  "description": "High-stakes T20 match",
  "matchDate": "2024-01-15T19:00:00Z",
  "matchId": 130179,
  "team1": "India",
  "team2": "Australia",
  "venue": "Melbourne Cricket Ground",
  "entryFee": 10.0,
  "maxParticipants": 1000
}
```

### PUT `/tournaments/:id`
Update tournament

### DELETE `/tournaments/:id`
Delete tournament (only if no participants)

### POST `/players`
Create player

### PUT `/players/:id`
Update player

### GET `/stats`
Get admin statistics

### GET `/tournaments`
Get all tournaments with detailed info

---

## 🏏 Cricket API Integration

### Setup

Add your RapidAPI key to `.env`:
```env
RAPIDAPI_KEY="your-rapidapi-key-here"
```

### Fetch Real Match Scores

```bash
# Fetch scores from Cricbuzz API
npm run scores:fetch-api -- <tournament-id> <match-id>

# Example
npm run scores:fetch-api -- 2c177359-eb3d-4c76-adc0-d6cb80a42a45 130179
```

This will:
1. 🏏 Fetch scorecard from Cricbuzz API
2. 📊 Parse batting, bowling, and fielding statistics
3. 🎯 Map player names to module names
4. 💾 Calculate fantasy points
5. ✅ Update database

### Find Match IDs

1. Go to [Cricbuzz](https://www.cricbuzz.com/)
2. Find the match you want
3. Look at the URL: `https://www.cricbuzz.com/live-cricket-scores/12345/match-name`
4. The match ID is `12345`

### Player Name Mapping

Currently mapped players:

| Cricbuzz Name | Module Name |
|---------------|-------------|
| Virat Kohli | ViratKohli |
| Rohit Sharma | RohitSharma |
| Hardik Pandya | HardikPandya |
| Jasprit Bumrah | JaspreetBumhrah |
| Shubhman Gill | ShubhmanGill |
| Kane Williamson | KaneWilliamson |
| Ben Stokes | BenStokes |
| Glen Maxwell | GlenMaxwell |
| Abhishek Sharma | AbhishekSharma |
| Shubham Dube | ShubhamDube |
| Travis Head | TravisHead |
| MS Dhoni | MSDhoni |
| Suryakumar Yadav | SuryakumarYadav |

**Add more players** in `/src/services/cricketApiService.ts`:

```typescript
const nameMap: { [key: string]: string } = {
  // ... existing mappings
  'newplayername': 'NewPlayerModule',
  'nplayer': 'NewPlayerModule',
};
```

### API Response Structure

The Cricbuzz API returns data in this format:

```json
{
  "scorecard": [
    {
      "inningsid": 1,
      "batsman": [
        {
          "id": 13625,
          "name": "Sahibzada Farhan",
          "balls": 38,
          "runs": 57,
          "fours": 5,
          "sixes": 3,
          "strkrate": "150",
          "outdec": "c Tilak Varma b Varun Chakaravarthy"
        }
      ],
      "bowler": [
        {
          "id": 123,
          "name": "Shivam Dube",
          "wickets": 0,
          "overs": 3,
          "runs": 23,
          "economy": "7.7"
        }
      ]
    }
  ]
}
```

### Test API Connection

```bash
cd backend
node test-cricket-api.js
```

---

## 🧪 Tournament Testing Guide

### Complete Testing Flow

#### Phase 1: Sync Data from Aptos Contract

```bash
# 1. Discover players from contract
GET http://localhost:3000/api/admin/discover-contract-players

# 2. Sync all data from contract (Recommended)
POST http://localhost:3000/api/admin/sync-all-from-contract

# 3. Verify synced data
GET http://localhost:3000/api/admin/players
GET http://localhost:3000/api/admin/users
GET http://localhost:3000/api/snapshots/aptos-holders
```

#### Phase 2: Create Tournament

```bash
POST http://localhost:3000/api/tournaments
Content-Type: application/json

{
  "name": "India vs Australia - T20 World Cup",
  "description": "Semi-final match",
  "matchDate": "2024-01-15T19:00:00Z",
  "matchId": 130179,
  "team1": "India",
  "team2": "Australia",
  "venue": "Melbourne Cricket Ground",
  "entryFee": 10.0,
  "maxParticipants": 1000
}
```

#### Phase 3: Pre-Match Snapshot

```bash
POST http://localhost:3000/api/snapshots/create
Content-Type: application/json

{
  "tournamentId": "TOURNAMENT_ID",
  "snapshotType": "PRE_MATCH",
  "useAptosData": true
}
```

#### Phase 4: Fetch Live Scores

```bash
# Option 1: Fetch from Cricbuzz API
npm run scores:fetch-api -- TOURNAMENT_ID 130179

# Option 2: Manual score entry
POST http://localhost:3000/api/scoring/player-scores
```

#### Phase 5: Post-Match Snapshot

```bash
POST http://localhost:3000/api/snapshots/create
Content-Type: application/json

{
  "tournamentId": "TOURNAMENT_ID",
  "snapshotType": "POST_MATCH",
  "useAptosData": true
}
```

#### Phase 6: Calculate and Distribute Rewards

```bash
# Calculate rewards (preview)
POST http://localhost:3000/api/rewards/calculate-snapshot-based
Content-Type: application/json

{
  "tournamentId": "TOURNAMENT_ID",
  "totalRewardAmount": 100
}

# Distribute rewards (actual Aptos transactions)
POST http://localhost:3000/api/rewards/distribute-contract-based
Content-Type: application/json

{
  "tournamentId": "TOURNAMENT_ID",
  "totalRewardAmount": 100
}
```

#### Phase 7: Tournament Completion

```bash
# Update tournament status
PATCH http://localhost:3000/api/tournaments/TOURNAMENT_ID
Content-Type: application/json

{
  "status": "COMPLETED"
}
```

### CLI Commands

```bash
# Tournament management
npm run tournament:create-sample
npm run tournament:list
npm run tournament:end -- <tournament-id>
npm run tournament:cleanup

# Score management
npm run scores:update -- <tournament-id>
npm run scores:get -- <tournament-id>
npm run scores:fetch-api -- <tournament-id> <match-id>

# End tournament with rewards
npm run end:with-snapshot -- <tournament-id> --amount 100
npm run end:snapshot-only -- <tournament-id>
npm run end:end-only -- <tournament-id>
npm run end:calculate-rewards -- <tournament-id> --amount 100
```

---

## 💎 User Rewards API

### Get All Rewards for a User

```bash
GET /api/user-rewards/:address
```

**Response:**
```json
{
  "success": true,
  "address": "0xaf230e...",
  "totalEarnings": 150.5,
  "totalRewards": 3,
  "rewards": [
    {
      "id": "reward-uuid",
      "tournamentId": "tournament-123",
      "tournamentName": "World Cup Final",
      "team1": "India",
      "team2": "Australia",
      "amount": 50.25,
      "status": "COMPLETED",
      "transactionId": "0x123abc...",
      "rank": 1
    }
  ]
}
```

### Get Tournament Leaderboard

```bash
GET /api/user-rewards/leaderboard/:tournamentId?limit=10
```

**Response:**
```json
{
  "success": true,
  "tournament": {
    "id": "tournament-123",
    "name": "World Cup Final"
  },
  "leaderboard": [
    {
      "rank": 1,
      "address": "0xaf230e...",
      "amount": 50.25,
      "percentage": 50.25,
      "status": "COMPLETED"
    }
  ]
}
```

### Frontend Usage Example

```typescript
// Fetch user's all rewards
const fetchUserRewards = async (address: string) => {
  const response = await fetch(
    `http://localhost:3000/api/user-rewards/${address}`
  );
  const data = await response.json();
  
  if (data.success) {
    console.log('Total Earnings:', data.totalEarnings);
    console.log('Rewards:', data.rewards);
  }
};
```

---

## 🧪 Testing

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Structure
```
src/__tests__/
├── setup.ts              # Test setup and Prisma mocking
└── routes/
    ├── admin.test.ts     # Admin route tests
    ├── rewards.test.ts   # Reward route tests
    ├── scoring.test.ts   # Scoring route tests
    └── tournaments.test.ts # Tournament route tests
```

---

## 🎮 Fantasy Scoring System

### Batting Points
- **Runs**: 1 point per run
- **Bonus**: 1 point per 2 balls faced (staying bonus)

### Bowling Points
- **Wickets**: 25 points per wicket
- **Overs**: 1 point per 2 balls bowled
- **Economy Bonus**: 
  - < 4 runs/over: +6 points
  - 4-6 runs/over: +4 points
  - 6-8 runs/over: +2 points

### Fielding Points
- **Catches**: 8 points per catch
- **Stumpings**: 10 points per stumping
- **Run Outs**: 6 points per run out

### Multipliers (For Team Context)
- **Captain**: 1.5x points
- **Vice-Captain**: 1.25x points

---

## 🏗️ Database Schema

The application uses a contract-first approach:

- **Users**: Wallet addresses synced from contract holders
- **Tournaments**: Single match tournaments with Cricbuzz match IDs
- **Players**: Cricket players mapped to contract modules
- **PlayerScores**: Match performance data with fantasy points
- **ContractSnapshots**: Pre/post-match blockchain state
- **RewardPools**: Flexible reward distribution
- **UserRewards**: Individual reward tracking with Aptos transaction IDs

### Key Models

```prisma
model Tournament {
  id                  String   @id @default(uuid())
  name                String
  matchId             BigInt?  // Cricbuzz match ID
  matchDate           DateTime
  team1               String
  team2               String
  status              TournamentStatus @default(UPCOMING)
  playerScores        PlayerScore[]
  rewardPools         RewardPool[]
  contractSnapshots   ContractSnapshot[]
}

model PlayerScore {
  id              String     @id @default(uuid())
  tournamentId    String
  moduleName      String     // Contract module name
  runs            Int
  ballsFaced      Int
  wickets         Int
  oversBowled     Float
  runsConceded    Int
  catches         Int
  stumpings       Int
  runOuts         Int
  fantasyPoints   Float
  tournament      Tournament @relation(fields: [tournamentId], references: [id])
}

model ContractSnapshot {
  id              String         @id @default(uuid())
  contractType    ContractType
  contractAddress String
  blockNumber     BigInt
  data            Json
  createdAt       DateTime       @default(now())
}

model UserReward {
  id                  String       @id @default(uuid())
  address             String       // Wallet address
  rewardPoolId        String
  rank                Int
  amount              Float
  percentage          Float?
  status              RewardStatus @default(PENDING)
  aptosTransactionId  String?      // Blockchain transaction ID
  metadata            Json?
  rewardPool          RewardPool   @relation(fields: [rewardPoolId], references: [id])
}
```

---

## 🔮 Future Enhancements

- WebSocket updates for real-time scores
- Advanced analytics and statistics
- Social features (friends, leagues)
- Mobile app integration
- Automated score updates with cron jobs
- Multi-tournament support
- Player performance history

---

## 🐛 Troubleshooting

### No Players Found
- Add player name mappings in `cricketApiService.ts`
- Check match scorecard availability

### API Rate Limits
- Wait a few minutes
- Upgrade RapidAPI plan
- Use different API key

### Invalid Match ID
- Verify match ID on Cricbuzz website
- Use `/discover/live-matches` endpoint

### Aptos Connection Failed
- Check network configuration
- Verify contract address
- Ensure wallet has funds

### Reward Distribution Failed
- Check admin account balance
- Verify private key configuration
- Ensure BOSON token availability

---

## 📝 License

ISC License

---

## 🤝 Support

For issues with:
- **API Integration**: Check `/src/services/cricketApiService.ts`
- **Name Mapping**: Update `nameMap` in cricketApiService
- **Fantasy Points**: Update calculation in fantasyPointsCalculator
- **Reward Distribution**: Check aptosService and rewardCalculationService

---

**Happy Cricket Fantasy Gaming! 🏏🎯**
