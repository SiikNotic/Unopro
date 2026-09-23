export { createBotController } from './botController';
export type { BotControllerConfig, BotSetup } from './botController';
export { createPlayerView } from './playerView';
export type { PlayerView } from './playerView';
export { DIFFICULTIES, PERSONALITIES, resolveProfile } from './profiles';
export type { BotDifficulty, BotPersonality, BotProfile } from './profiles';
export { chooseAction } from './strategy';
export { getBotTable, BOT_TABLES, withDifficulty } from './config';
export type { BotTableConfig } from './config';
