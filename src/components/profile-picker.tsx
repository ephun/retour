import { ReactComponent as BusSvg } from '@/images/bus.svg';
import { ReactComponent as CarSvg } from '@/images/car.svg';
import { ReactComponent as TruckSvg } from '@/images/truck.svg';
import { ReactComponent as BikeSvg } from '@/images/bike.svg';
import { ReactComponent as PedestrianSvg } from '@/images/pedestrian.svg';
import type { Profile } from '@/stores/common-store';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { useCallback } from 'react';
import { useCommonStore } from '@/stores/common-store';
import { Loader2 } from 'lucide-react';
import { useSearch } from '@tanstack/react-router';

const iconMap = {
  car: <CarSvg />,
  pedestrian: <PedestrianSvg />,
  bicycle: <BikeSvg />,
  bus: <BusSvg />,
  truck: <TruckSvg />,
};

interface ProfilePickerProps {
  loading: boolean;
  onProfileChange: (value: Profile) => void;
}

export const ProfilePicker = ({
  loading,
  onProfileChange,
}: ProfilePickerProps) => {
  const resetSettings = useCommonStore((state) => state.resetSettings);
  const { profile: activeProfile } = useSearch({ from: '/$activeTab' });

  const handleUpdateProfile = useCallback(
    (value: Profile) => {
      resetSettings(value);
      onProfileChange(value);
    },
    [resetSettings, onProfileChange]
  );

  const profiles = [
    { value: 'car', label: 'Car' },
    { value: 'pedestrian', label: 'Pedestrian' },
    { value: 'bicycle', label: 'Bicycle' },
    { value: 'bus', label: 'Bus' },
    { value: 'truck', label: 'Truck' },
  ];

  return (
    <div className="flex flex-col gap-2">
      <TooltipProvider>
        <ToggleGroup
          type="single"
          variant="outline"
          value={activeProfile}
          onValueChange={(value: Profile) => {
            if (value && value !== activeProfile) {
              handleUpdateProfile(value);
            }
          }}
        >
          {profiles.map((profile, i) => (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value={profile.value}
                  aria-label={`Select ${profile.label} profile`}
                  data-testid={`profile-button-` + profile.value}
                  data-state={profile.value === activeProfile ? 'on' : 'off'}
                >
                  {profile.value === activeProfile && loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    iconMap[profile.value as keyof typeof iconMap]
                  )}
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent>{profile.label}</TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>
      </TooltipProvider>
    </div>
  );
};
