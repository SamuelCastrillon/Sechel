/**
 * Known setting keys that are allowed to be set.
 * Separated from the 'use server' file because Next.js requires that
 * 'use server' files only export async functions.
 */
export const ALLOWED_SETTING_KEYS = ['registration_enabled'] as const;

export type AllowedSettingKey = (typeof ALLOWED_SETTING_KEYS)[number];
