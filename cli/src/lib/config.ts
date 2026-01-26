// ===========================================
// ZYPHRON CLI - CONFIGURATION MANAGEMENT
// Handles auth tokens and settings storage
// ===========================================

import Conf from 'conf';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// ===========================================
// TYPES
// ===========================================

export interface UserConfig {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface ZyphronConfig {
  apiUrl: string;
  token: string | null;
  user: UserConfig | null;
  defaultTeam: string | null;
}

export interface ProjectConfig {
  projectId: string;
  projectSlug: string;
  branch: string;
}

// ===========================================
// GLOBAL CONFIG (~/.zyphron/config.json)
// ===========================================

const config = new Conf<ZyphronConfig>({
  projectName: 'zyphron',
  defaults: {
    apiUrl: process.env.ZYPHRON_API_URL || 'https://api.zyphron.dev',
    token: null,
    user: null,
    defaultTeam: null,
  },
});

export function getConfig(): ZyphronConfig {
  return {
    apiUrl: config.get('apiUrl'),
    token: config.get('token'),
    user: config.get('user'),
    defaultTeam: config.get('defaultTeam'),
  };
}

export function setApiUrl(url: string): void {
  config.set('apiUrl', url);
}

export function getApiUrl(): string {
  return config.get('apiUrl');
}

export function setToken(token: string): void {
  config.set('token', token);
}

export function getToken(): string | null {
  return config.get('token');
}

export function clearToken(): void {
  config.delete('token');
  config.delete('user');
}

export function setUser(user: UserConfig): void {
  config.set('user', user);
}

export function getUser(): UserConfig | null {
  return config.get('user');
}

export function setDefaultTeam(teamId: string): void {
  config.set('defaultTeam', teamId);
}

export function getDefaultTeam(): string | null {
  return config.get('defaultTeam');
}

export function isAuthenticated(): boolean {
  return !!config.get('token');
}

export function clearConfig(): void {
  config.clear();
}

// ===========================================
// PROJECT CONFIG (./zyphron.json)
// ===========================================

const PROJECT_CONFIG_FILE = 'zyphron.json';

export function getProjectConfigPath(): string {
  return join(process.cwd(), PROJECT_CONFIG_FILE);
}

export function hasProjectConfig(): boolean {
  return existsSync(getProjectConfigPath());
}

export function getProjectConfig(): ProjectConfig | null {
  const configPath = getProjectConfigPath();
  
  if (!existsSync(configPath)) {
    return null;
  }
  
  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as ProjectConfig;
  } catch {
    return null;
  }
}

export function setProjectConfig(projectConfig: ProjectConfig): void {
  const configPath = getProjectConfigPath();
  writeFileSync(configPath, JSON.stringify(projectConfig, null, 2));
}

export function clearProjectConfig(): void {
  const configPath = getProjectConfigPath();
  if (existsSync(configPath)) {
    writeFileSync(configPath, '{}');
  }
}

// ===========================================
// ENVIRONMENT VARIABLES
// ===========================================

export function getEnvApiUrl(): string {
  return process.env.ZYPHRON_API_URL || getApiUrl();
}

export function getEnvToken(): string | null {
  return process.env.ZYPHRON_TOKEN || getToken();
}
