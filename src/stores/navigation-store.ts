import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Maneuver, ParsedDirectionsGeometry } from '@/components/types';
import { getPointAtIndex, distanceMeters } from '@/utils/navigation';
import { speak, stopSpeaking } from '@/utils/tts';
import { getDirectionsLanguage } from '@/utils/directions-language';

interface UserPosition {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number;
}

interface NavigationState {
  isNavigating: boolean;
  currentManeuverIndex: number;
  currentLegIndex: number;
  userPosition: UserPosition | null;
  maneuvers: Maneuver[];
  distanceToNextManeuver: number;
  route: ParsedDirectionsGeometry | null;
  voiceEnabled: boolean;
  watchId: number | null;
  spokenPreTransition: boolean;
}

interface NavigationActions {
  startNavigation: (routeData: ParsedDirectionsGeometry) => void;
  stopNavigation: () => void;
  updatePosition: (coords: GeolocationCoordinates) => void;
  advanceManeuver: () => void;
  toggleVoice: () => void;
  setWatchId: (id: number | null) => void;
}

type NavigationStore = NavigationState & NavigationActions;

export const useNavigationStore = create<NavigationStore>()(
  devtools(
    immer((set, get) => ({
      isNavigating: false,
      currentManeuverIndex: 0,
      currentLegIndex: 0,
      userPosition: null,
      maneuvers: [],
      distanceToNextManeuver: 0,
      route: null,
      voiceEnabled: true,
      watchId: null,
      spokenPreTransition: false,

      startNavigation: (routeData) => {
        const allManeuvers: Maneuver[] = [];
        for (const leg of routeData.trip.legs) {
          allManeuvers.push(...leg.maneuvers);
        }

        set(
          (state) => {
            state.isNavigating = true;
            state.currentManeuverIndex = 0;
            state.currentLegIndex = 0;
            state.maneuvers = allManeuvers;
            state.distanceToNextManeuver = 0;
            state.route = routeData;
            state.userPosition = null;
            state.spokenPreTransition = false;
          },
          undefined,
          'startNavigation'
        );

        // Speak first instruction
        const first = allManeuvers[0];
        if (first && get().voiceEnabled) {
          speak(
            first.verbal_pre_transition_instruction,
            getDirectionsLanguage()
          );
        }

        // Start geolocation watch
        if (navigator.geolocation) {
          const id = navigator.geolocation.watchPosition(
            (position) => {
              get().updatePosition(position.coords);
            },
            (error) => {
              console.error('Geolocation error:', error);
            },
            {
              enableHighAccuracy: true,
              maximumAge: 2000,
              timeout: 10000,
            }
          );
          set({ watchId: id });
        }
      },

      stopNavigation: () => {
        const { watchId } = get();
        if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
        }
        stopSpeaking();

        set(
          (state) => {
            state.isNavigating = false;
            state.currentManeuverIndex = 0;
            state.currentLegIndex = 0;
            state.userPosition = null;
            state.maneuvers = [];
            state.distanceToNextManeuver = 0;
            state.route = null;
            state.watchId = null;
            state.spokenPreTransition = false;
          },
          undefined,
          'stopNavigation'
        );
      },

      updatePosition: (coords) => {
        const state = get();
        if (!state.isNavigating || !state.route) return;

        const userPos = {
          lat: coords.latitude,
          lng: coords.longitude,
          heading: coords.heading,
          speed: coords.speed,
          accuracy: coords.accuracy,
        };

        const currentManeuver = state.maneuvers[state.currentManeuverIndex];
        if (!currentManeuver) return;

        const decodedGeometry = state.route.decodedGeometry;
        const endPoint = getPointAtIndex(
          decodedGeometry,
          currentManeuver.end_shape_index
        );
        const dist = distanceMeters(
          userPos.lat,
          userPos.lng,
          endPoint[0],
          endPoint[1]
        );

        const lang = getDirectionsLanguage();
        const isLastManeuver =
          state.currentManeuverIndex >= state.maneuvers.length - 1;

        if (dist <= 30) {
          if (isLastManeuver) {
            // Arrived
            if (state.voiceEnabled) {
              speak('You have arrived at your destination', lang);
            }
            get().stopNavigation();
            return;
          }

          // Advance to next maneuver
          const nextIndex = state.currentManeuverIndex + 1;
          const nextManeuver = state.maneuvers[nextIndex];

          set(
            (s) => {
              s.currentManeuverIndex = nextIndex;
              s.userPosition = userPos;
              s.distanceToNextManeuver = dist;
              s.spokenPreTransition = false;
            },
            undefined,
            'advanceManeuver'
          );

          if (nextManeuver && state.voiceEnabled) {
            speak(
              nextManeuver.verbal_succinct_transition_instruction ??
                nextManeuver.verbal_pre_transition_instruction,
              lang
            );
          }
          return;
        }

        // Check if within 200m - speak pre-transition warning
        if (dist <= 200 && !state.spokenPreTransition) {
          const nextManeuver =
            state.maneuvers[state.currentManeuverIndex + 1] ?? currentManeuver;
          if (state.voiceEnabled) {
            speak(nextManeuver.verbal_pre_transition_instruction, lang);
          }
          set(
            (s) => {
              s.spokenPreTransition = true;
            },
            undefined,
            'spokenPreTransition'
          );
        }

        set(
          (s) => {
            s.userPosition = userPos;
            s.distanceToNextManeuver = dist;
          },
          undefined,
          'updatePosition'
        );
      },

      advanceManeuver: () => {
        set(
          (state) => {
            if (state.currentManeuverIndex < state.maneuvers.length - 1) {
              state.currentManeuverIndex += 1;
              state.spokenPreTransition = false;
            }
          },
          undefined,
          'advanceManeuver'
        );
      },

      toggleVoice: () => {
        set(
          (state) => {
            state.voiceEnabled = !state.voiceEnabled;
            if (!state.voiceEnabled) {
              stopSpeaking();
            }
          },
          undefined,
          'toggleVoice'
        );
      },

      setWatchId: (id) => {
        set({ watchId: id });
      },
    })),
    { name: 'navigation' }
  )
);
