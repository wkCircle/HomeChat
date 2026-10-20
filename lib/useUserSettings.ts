'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import apiFetch, { responseError } from './api';
import type { ToolCatalogResponse, ToolDefinition, UserSettings, UserSettingsUpdate } from './types';

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [isLoadingSettings, setLoading] = useState(true);
  const [isSavingSettings, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = useRef<UserSettings | null>(null);
  const loading = useRef(true);
  const saving = useRef(false);
  const mounted = useRef(false);
  const revision = useRef(0);

  const reloadSettings = useCallback(async () => {
    if (saving.current) return;
    const request = ++revision.current;
    loading.current = true;
    setLoading(true);
    setError(null);
    try {
      const [settingsResponse, catalogResponse] = await Promise.all([
        apiFetch('/api/chat/settings'), apiFetch('/api/chat/tools'),
      ]);
      if (!settingsResponse.ok) throw await responseError(settingsResponse, 'Unable to load settings.');
      if (!catalogResponse.ok) throw await responseError(catalogResponse, 'Unable to load available tools.');
      const [value, catalog] = await Promise.all([
        settingsResponse.json() as Promise<UserSettings>,
        catalogResponse.json() as Promise<ToolCatalogResponse>,
      ]);
      if (mounted.current && revision.current === request) {
        confirmed.current = value;
        setSettings(value);
        setTools(catalog.tools);
      }
    } catch (error) {
      if (mounted.current && revision.current === request) {
        setError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (mounted.current && revision.current === request) {
        loading.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reloadSettings();
    return () => { mounted.current = false; revision.current += 1; };
  }, [reloadSettings]);

  const saveSettings = useCallback(async (update: UserSettingsUpdate): Promise<boolean> => {
    if (saving.current || loading.current || !confirmed.current) {
      setError('Wait for settings to finish loading or saving.');
      return false;
    }
    saving.current = true;
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch('/api/chat/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update),
      });
      if (!response.ok) throw await responseError(response, 'Unable to save settings.');
      const value = (await response.json()) as UserSettings;
      if (mounted.current) {
        confirmed.current = value;
        setSettings(value);
        setError(null);
      }
      return true;
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      saving.current = false;
      if (mounted.current) setSaving(false);
    }
  }, []);

  const isSaving = useCallback(() => saving.current, []);
  return { settings, tools, isLoadingSettings, isSavingSettings, error, reloadSettings, saveSettings, isSaving };
}

export type UserSettingsController = ReturnType<typeof useUserSettings>;
