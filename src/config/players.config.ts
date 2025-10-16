/**
 * Player Configuration
 * 
 * SINGLE SOURCE OF TRUTH for all player module names
 * Update this file to add/remove players across the entire application
 */

export interface PlayerModule {
  moduleName: string;
  displayName: string;
  team: string;
  role: 'BAT' | 'BOWL' | 'AR' | 'WK';
}

/**
 * All player modules
 * This is the ONLY place where player modules should be defined
 * Synced from interface/lib/constants.ts (frontend)
 */
export const PLAYER_MODULES: PlayerModule[] = [
  {
    moduleName: 'AbhishekSharma',
    displayName: 'Abhishek Sharma',
    team: 'IND',
    role: 'BAT'
  },
  {
    moduleName: 'AlickAthanaze',
    displayName: 'Alick Athanaze',
    team: 'WI',
    role: 'BAT'
  },
  {
    moduleName: 'BenStokes',
    displayName: 'Ben Stokes',
    team: 'ENG',
    role: 'AR'
  },
  {
    moduleName: 'GlenMaxwell',
    displayName: 'Glenn Maxwell',
    team: 'AUS',
    role: 'AR'
  },
  {
    moduleName: 'HardikPandya',
    displayName: 'Hardik Pandya',
    team: 'IND',
    role: 'AR'
  },
  {
    moduleName: 'HarryBrook',
    displayName: 'Harry Brook',
    team: 'ENG',
    role: 'BAT'
  },
  {
    moduleName: 'JaspreetBumhrah',
    displayName: 'Jasprit Bumrah',
    team: 'IND',
    role: 'BOWL'
  },
  {
    moduleName: 'JoeRoot',
    displayName: 'Joe Root',
    team: 'ENG',
    role: 'BAT'
  },
  {
    moduleName: 'JohnCampbell',
    displayName: 'John Campbell',
    team: 'WI',
    role: 'BAT'
  },
  {
    moduleName: 'JosButtler',
    displayName: 'Jos Buttler',
    team: 'ENG',
    role: 'WK'
  },
  {
    moduleName: 'JoshInglis',
    displayName: 'Josh Inglis',
    team: 'AUS',
    role: 'WK'
  },
  {
    moduleName: 'KaneWilliamson',
    displayName: 'Kane Williamson',
    team: 'NZ',
    role: 'BAT'
  },
  {
    moduleName: 'KharyPierre',
    displayName: 'Khary Pierre',
    team: 'WI',
    role: 'BOWL'
  },
  {
    moduleName: 'KLRahul',
    displayName: 'KL Rahul',
    team: 'IND',
    role: 'WK'
  },
  {
    moduleName: 'MohammedSiraj',
    displayName: 'Mohammed Siraj',
    team: 'IND',
    role: 'BOWL'
  },
  {
    moduleName: 'RishabhPant',
    displayName: 'Rishabh Pant',
    team: 'IND',
    role: 'WK'
  },
  {
    moduleName: 'RohitSharma',
    displayName: 'Rohit Sharma',
    team: 'IND',
    role: 'BAT'
  },
  {
    moduleName: 'ShaiHope',
    displayName: 'Shai Hope',
    team: 'WI',
    role: 'WK'
  },
  {
    moduleName: 'ShubhamDube',
    displayName: 'Shubham Dube',
    team: 'IND',
    role: 'AR'
  },
  {
    moduleName: 'ShubhmanGill',
    displayName: 'Shubman Gill',
    team: 'IND',
    role: 'BAT'
  },
  {
    moduleName: 'SuryakumarYadav',
    displayName: 'Suryakumar Yadav',
    team: 'IND',
    role: 'BAT'
  },
  {
    moduleName: 'TravisHead',
    displayName: 'Travis Head',
    team: 'AUS',
    role: 'BAT'
  },
  {
    moduleName: 'ViratKohli',
    displayName: 'Virat Kohli',
    team: 'IND',
    role: 'BAT'
  },
  {
    moduleName: 'WashingtonSundar',
    displayName: 'Washington Sundar',
    team: 'IND',
    role: 'AR'
  },
  {
    moduleName: 'YashasviJaiswal',
    displayName: 'Yashasvi Jaiswal',
    team: 'IND',
    role: 'BAT'
  },
];

/**
 * Game token module (not a player)
 */
export const GAME_TOKEN_MODULE = 'Boson';

/**
 * All modules including game token
 */
export const ALL_MODULES = [
  ...PLAYER_MODULES.map(p => p.moduleName),
  GAME_TOKEN_MODULE
];

/**
 * Get player module names only (array of strings)
 */
export const getPlayerModuleNames = (): string[] => {
  return PLAYER_MODULES.map(p => p.moduleName);
};

/**
 * Get all module names including Boson
 */
export const getAllModuleNames = (): string[] => {
  return ALL_MODULES;
};

/**
 * Get player by module name
 */
export const getPlayerByModuleName = (moduleName: string): PlayerModule | undefined => {
  return PLAYER_MODULES.find(p => p.moduleName === moduleName);
};

/**
 * Check if module is a player (not game token)
 */
export const isPlayerModule = (moduleName: string): boolean => {
  return PLAYER_MODULES.some(p => p.moduleName === moduleName);
};

