'use client';

import { useState, useCallback, useEffect } from 'react';
import { getSettings, setSetting } from '@/modules/panel/actions/settings';
import { Switch } from '@/modules/panel/components/ui/switch';

interface Setting {
  key: string;
  value: string;
  updated_at: string;
}

export function SettingsForm({ initialSettings = [] }: { initialSettings?: Setting[] }) {
  const [settings, setSettings] = useState<Setting[]>(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    const result = await getSettings();
    if (result.success) {
      setSettings((result.data as Setting[]) ?? []);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  const handleSave = async (key: string, value: string) => {
    setSaving(key);
    const result = await setSetting(key, value);
    if (result.success) {
      await fetchSettings();
    } else {
      setError(result.error);
    }
    setSaving(null);
  };

  return (
    <div className="border border-outline-variant bg-card">
      <div className="border-b border-outline-variant px-4 py-2 bg-[#131313]">
        <p className="text-[10px] font-mono text-on-primary-container tracking-wider">
          [SETTINGS] INSTANCE CONFIGURATION — {settings.length} KEYS
        </p>
      </div>

      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/30">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <div className="divide-y divide-outline-variant/50">
        {settings.map((setting) => (
          <SettingRow
            key={setting.key}
            setting={setting}
            onSave={handleSave}
            isSaving={saving === setting.key}
          />
        ))}
        {settings.length === 0 && (
          <p className="px-4 py-8 text-center text-muted-foreground text-xs">
            No settings found.
          </p>
        )}
      </div>
    </div>
  );
}

function isBooleanValue(value: string): boolean {
  return value === '0' || value === '1';
}

function SettingRow({
  setting,
  onSave,
  isSaving,
}: {
  setting: Setting;
  onSave: (key: string, value: string) => Promise<void>;
  isSaving: boolean;
}) {
  const [editValue, setEditValue] = useState(setting.value);

  // Sync when setting changes externally
  useEffect(() => {
    setEditValue(setting.value);
  }, [setting.value]);

  const isBool = isBooleanValue(setting.value);

  if (isBool) {
    const checked = editValue === '1';
    return (
      <div className="px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-outline">
            {setting.key.replace(/_/g, ' ')}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {checked ? 'Enabled — new users can register' : 'Disabled — registration closed'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isSaving && (
            <span className="text-[9px] font-mono text-muted-foreground">SAVING...</span>
          )}
          <Switch
            checked={checked}
            onChange={(v) => onSave(setting.key, v ? '1' : '0')}
            disabled={isSaving}
          />
          <span className={`text-[10px] font-bold font-mono tracking-wider ${
            checked ? 'text-green-400' : 'text-muted-foreground'
          }`}>
            {checked ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-outline mb-1">
          {setting.key.replace(/_/g, ' ')}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="flex-1 bg-[#0c0c0c] border border-outline-variant text-on-surface text-sm px-3 py-1.5 placeholder:text-surface-variant focus:outline-none focus:border-primary font-mono"
          />
          <button
            onClick={() => onSave(setting.key, editValue)}
            disabled={isSaving || editValue === setting.value}
            className="bg-primary text-white font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 transition-all hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'SAVING...' : 'SAVE'}
          </button>
        </div>
      </div>
      <div className="text-[9px] font-mono text-outline-variant whitespace-nowrap">
        {setting.updated_at ? new Date(setting.updated_at + 'Z').toLocaleString() : '—'}
      </div>
    </div>
  );
}
