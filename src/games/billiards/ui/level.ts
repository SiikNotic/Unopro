import { storage } from '@/storage';
import { BOT_LEVELS } from '../ai';
import type { BotLevel } from '../ai';

/** The bot level the player picked last (kept on this device). */
export const LEVEL_KEY = 'billiards.level';
export const loadLevel = (): BotLevel => {
  const v = storage.get<string>(LEVEL_KEY);
  return BOT_LEVELS.includes(v as BotLevel) ? (v as BotLevel) : 'normal';
};
