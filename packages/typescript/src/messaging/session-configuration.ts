export type HistorySyncPolicy = {
  mode: "metadata_only" | "deliver";
  requestFull: boolean;
};

/** Customer settings with implemented runtime consumers. */
export type HmsConfiguration =
  | { enabled: false }
  | {
      enabled: true;
      region: string;
      policy:
        "short" | "standard" | "extended" | "compliance" | "enterprise_archive";
      retentionDays?: number;
      policyVersion?: string;
      legalHold?: boolean;
    };

export interface ObservationConfiguration {
  presenceMode: "off" | "events" | "cache";
  typingMode: "off" | "events" | "cache";
  labelMode: "off" | "events" | "cache" | "project";
  quickReplyMode: "off" | "events" | "cache";
}
export interface SessionConfigurationOverrides {
  observation?: Partial<ObservationConfiguration>;
  historySync?: Partial<HistorySyncPolicy>;
  /** Atomic policy replacement; enabling requires separate live authorization. */
  hms?: HmsConfiguration;
}

export interface EffectiveSessionConfiguration {
  observation: ObservationConfiguration;
  historySync: HistorySyncPolicy;
  hms: HmsConfiguration;
}

export type ConfigurationSource = "platform" | "team" | "project" | "session";
export type ConfigurationValueSource = ConfigurationSource | "consent";
export type SessionConfigurationReset =
  | "historySync"
  | "historySync.mode"
  | "historySync.requestFull"
  | "hms"
  | "observation"
  | `observation.${keyof ObservationConfiguration}`;
export interface SessionConfigurationPatch {
  set?: SessionConfigurationOverrides;
  reset?: SessionConfigurationReset[];
}
export interface ResolvedSessionConfiguration {
  effective: EffectiveSessionConfiguration;
  overrides: SessionConfigurationOverrides;
  sources: {
    "historySync.mode": ConfigurationValueSource;
    "historySync.requestFull": ConfigurationValueSource;
    hms: ConfigurationSource;
    "observation.presenceMode": ConfigurationSource;
    "observation.typingMode": ConfigurationSource;
    "observation.labelMode": ConfigurationSource;
    "observation.quickReplyMode": ConfigurationSource;
  };
}

export interface SessionConfigurationView extends ResolvedSessionConfiguration {
  requestedHistory: HistorySyncPolicy;
  historyConsent?: "pending" | "accepted" | "declined";
  revisions: { team: number; project: number; session: number };
  application?: {
    desiredGeneration: number;
    appliedGeneration: number;
    status: "pending" | "applied";
  };
}
