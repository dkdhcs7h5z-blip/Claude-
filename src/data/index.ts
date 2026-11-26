import { env, isSupabaseConfigured } from '@/lib/env';
import type { DataService } from './service';
import { SupabaseService } from './supabaseService';
import { DemoService } from './demoService';

export const api: DataService = isSupabaseConfigured
  ? new SupabaseService(env.supabaseUrl, env.supabaseAnonKey)
  : new DemoService();

export type { DataService } from './service';
