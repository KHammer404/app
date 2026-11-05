export const CAREGIVER_KEY = "@samkim/caregiver";

export type CaregiverSettings = {
  everyNth: 1 | 2 | 3;
  confidentOnly: boolean;
  haptic: boolean;
  allowSkip: boolean;
  periodicSeconds: 20 | 30 | 45;
};

export const DEFAULT_CAREGIVER: CaregiverSettings = {
  everyNth: 1,
  confidentOnly: false,
  haptic: true,
  allowSkip: true,
  periodicSeconds: 20,
};

function isNth(value: unknown): value is CaregiverSettings["everyNth"] {
  return value === 1 || value === 2 || value === 3;
}

function isPeriod(value: unknown): value is CaregiverSettings["periodicSeconds"] {
  return value === 20 || value === 30 || value === 45;
}

export function parseCaregiver(raw: string | null): CaregiverSettings {
  if (!raw) return DEFAULT_CAREGIVER;
  try {
    const value = JSON.parse(raw) as Partial<CaregiverSettings>;
    return {
      everyNth: isNth(value.everyNth) ? value.everyNth : 1,
      confidentOnly: value.confidentOnly === true,
      haptic: value.haptic !== false,
      allowSkip: value.allowSkip !== false,
      periodicSeconds: isPeriod(value.periodicSeconds) ? value.periodicSeconds : 20,
    };
  } catch {
    return DEFAULT_CAREGIVER;
  }
}

export function voiceRequest(
  settings: CaregiverSettings,
  trigger: "auto" | "manual" | "periodic",
  confidence: number | undefined,
  autoCount: number,
) {
  if (trigger !== "auto") return { request: true, autoCount };
  if (settings.confidentOnly && (confidence ?? 0) < 0.7) return { request: false, autoCount };
  const next = autoCount + 1;
  return { request: next % settings.everyNth === 0, autoCount: next };
}
