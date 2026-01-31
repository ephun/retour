import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  profileSettings,
  generalSettings,
  languageOptions,
  type DirectionsLanguage,
} from './settings-options';
import { filterProfileSettings } from '@/utils/filter-profile-settings';
import {
  getDirectionsLanguage,
  setDirectionsLanguage,
} from '@/utils/directions-language';
import type { PossibleSettings } from '@/components/types';

import { SliderSetting } from '@/components/ui/slider-setting';
import { CheckboxSetting } from '@/components/ui/checkbox-setting';
import { SelectSetting } from '@/components/ui/select-setting';
import { useCommonStore, type Profile } from '@/stores/common-store';
import {
  Copy,
  RotateCcw,
  Languages,
  SlidersHorizontal,
  Settings2,
} from 'lucide-react';
import { useSearch } from '@tanstack/react-router';
import { useDirectionsQuery } from '@/hooks/use-directions-queries';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { ServerSettings } from '@/components/settings-panel/server-settings';

type ProfileWithSettings = Exclude<Profile, 'auto'>;

export const SettingsPanelInline = () => {
  const { profile } = useSearch({ from: '/$activeTab' });
  const settings = useCommonStore((state) => state.settings);
  const updateSettings = useCommonStore((state) => state.updateSettings);
  const resetSettings = useCommonStore((state) => state.resetSettings);
  const [copied, setCopied] = useState(false);
  const { refetch: refetchDirections } = useDirectionsQuery();

  const [language, setLanguage] = useState<DirectionsLanguage>(() =>
    getDirectionsLanguage()
  );

  const [languageSettingsOpen, setLanguageSettingsOpen] = useState(true);
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(true);
  const [generalSettingsOpen, setGeneralSettingsOpen] = useState(true);

  const handleLanguageChange = useCallback(
    (value: string) => {
      const newLanguage = value as DirectionsLanguage;
      setDirectionsLanguage(newLanguage);
      setLanguage(newLanguage);
      refetchDirections();
    },
    [refetchDirections]
  );

  const handleMakeRequest = useCallback(() => {
    refetchDirections();
  }, [refetchDirections]);

  const handleUpdateSettings = useCallback(
    ({
      name,
      value,
    }: {
      name: keyof PossibleSettings;
      value: PossibleSettings[keyof PossibleSettings];
    }) => {
      updateSettings(name, value);
      refetchDirections();
    },
    [updateSettings, refetchDirections]
  );

  const handleCopySettings = useCallback(async () => {
    const text = JSON.stringify(
      filterProfileSettings(profile as ProfileWithSettings, settings)
    );
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 1000);
  }, [profile, settings]);

  const resetConfigSettings = useCallback(() => {
    resetSettings(profile || 'bicycle');
    refetchDirections();
  }, [profile, resetSettings, refetchDirections]);

  const hasProfileSettings =
    profileSettings[profile as ProfileWithSettings].boolean.length > 0;

  return (
    <div className="space-y-3">
      <ServerSettings />

      <CollapsibleSection
        title="Directions Language"
        icon={Languages}
        open={languageSettingsOpen}
        onOpenChange={setLanguageSettingsOpen}
      >
        <SelectSetting
          id="directions-language"
          label="Language"
          description="The language used for turn-by-turn navigation instructions"
          placeholder="Select Language"
          value={language}
          options={[...languageOptions]}
          onValueChange={handleLanguageChange}
        />
      </CollapsibleSection>

      {hasProfileSettings && (
        <CollapsibleSection
          title="Profile Settings"
          icon={SlidersHorizontal}
          subtitle={`(${profile})`}
          open={profileSettingsOpen}
          onOpenChange={setProfileSettingsOpen}
        >
          <div className="space-y-1.25">
            {profileSettings[profile as ProfileWithSettings].numeric.map(
              (option, key) => (
                <SliderSetting
                  key={key}
                  id={option.param}
                  label={option.name}
                  description={option.description}
                  min={option.settings.min}
                  max={option.settings.max}
                  step={option.settings.step}
                  value={(settings[option.param] as number) ?? 0}
                  unit={option.unit}
                  onValueChange={(values) => {
                    updateSettings(option.param, values[0] ?? 0);
                  }}
                  onValueCommit={handleMakeRequest}
                  onInputChange={(values) => {
                    let value = values[0] ?? 0;
                    if (isNaN(value)) value = option.settings.min;
                    value = Math.max(
                      option.settings.min,
                      Math.min(value, option.settings.max)
                    );
                    handleUpdateSettings({
                      name: option.param,
                      value,
                    });
                  }}
                />
              )
            )}
            {profileSettings[profile as ProfileWithSettings].boolean.map(
              (option, key) => (
                <CheckboxSetting
                  key={key}
                  id={option.param}
                  label={option.name}
                  description={option.description}
                  checked={Boolean(settings[option.param])}
                  onCheckedChange={(checked) => {
                    handleUpdateSettings({
                      name: option.param,
                      value: checked,
                    });
                  }}
                />
              )
            )}
            {profileSettings[profile as ProfileWithSettings].enum.map(
              (option, key) => (
                <SelectSetting
                  key={key}
                  id={option.param}
                  label={option.name}
                  description={option.description}
                  placeholder="Select Bicycle Type"
                  value={settings.bicycle_type as string}
                  options={option.enums}
                  onValueChange={(value) => {
                    handleUpdateSettings({
                      name: option.param,
                      value,
                    });
                  }}
                />
              )
            )}
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title="General Settings"
        icon={Settings2}
        open={generalSettingsOpen}
        onOpenChange={setGeneralSettingsOpen}
      >
        <div className="space-y-1.25">
          {generalSettings[profile as ProfileWithSettings].numeric.map(
            (option, key) => (
              <SliderSetting
                key={key}
                id={option.param}
                label={option.name}
                description={option.description}
                min={option.settings.min}
                max={option.settings.max}
                step={option.settings.step}
                value={(settings[option.param] as number) ?? 0}
                unit={option.unit}
                onValueChange={(values) => {
                  updateSettings(option.param, values[0] ?? 0);
                }}
                onValueCommit={handleMakeRequest}
                onInputChange={(values) => {
                  let value = values[0] ?? 0;
                  if (isNaN(value)) value = option.settings.min;
                  value = Math.max(
                    option.settings.min,
                    Math.min(value, option.settings.max)
                  );
                  handleUpdateSettings({
                    name: option.param,
                    value,
                  });
                }}
              />
            )
          )}
          {generalSettings[profile as ProfileWithSettings].boolean.map(
            (option, key) => (
              <CheckboxSetting
                key={key}
                id={option.param}
                label={option.name}
                description={option.description}
                checked={Boolean(settings[option.param])}
                onCheckedChange={(checked) => {
                  handleUpdateSettings({
                    name: option.param,
                    value: checked,
                  });
                }}
              />
            )
          )}
          {generalSettings.all.boolean.map((option, key) => (
            <CheckboxSetting
              key={key}
              id={option.param}
              label={option.name}
              description={option.description}
              checked={Boolean(settings[option.param])}
              onCheckedChange={(checked) => {
                handleUpdateSettings({
                  name: option.param,
                  value: checked,
                });
              }}
            />
          ))}
          {generalSettings.all.numeric.map((option, key) => (
            <SliderSetting
              key={key}
              id={option.param}
              label={option.name}
              description={option.description}
              min={option.settings.min}
              max={option.settings.max}
              step={option.settings.step}
              value={(settings[option.param] as number) ?? 0}
              unit={option.unit}
              onValueChange={(values) => {
                updateSettings(option.param, values[0] ?? 0);
              }}
              onValueCommit={handleMakeRequest}
              onInputChange={(values) => {
                let value = values[0] ?? 0;
                if (isNaN(value)) value = option.settings.min;
                value = Math.max(
                  option.settings.min,
                  Math.min(value, option.settings.max)
                );
                handleUpdateSettings({
                  name: option.param,
                  value,
                });
              }}
            />
          ))}
        </div>
      </CollapsibleSection>

      <div className="flex gap-2 pt-1">
        <Button
          variant={copied ? 'default' : 'outline'}
          size="sm"
          onClick={handleCopySettings}
          className={copied ? 'bg-green-600 hover:bg-green-600' : ''}
        >
          <Copy className="size-3.5" />
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </Button>
        <Button variant="outline" size="sm" onClick={resetConfigSettings}>
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
      </div>
    </div>
  );
};
