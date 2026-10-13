import type { Clock, IdGenerator } from '@/application/ports';

export const systemClock: Clock = { now: () => new Date().toISOString() };

export const randomIds: IdGenerator = { newId: () => crypto.randomUUID() };
