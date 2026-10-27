export type HistorySyncDelivery = "archive" | "descriptor";
export type HistorySyncPolicy = {
  readonly delivery?: HistorySyncDelivery;
  readonly mode: "metadata_only" | "deliver";
  readonly requestFull: boolean;
};

export interface HistorySyncPolicyPatch {
  readonly mode?: "metadata_only" | "deliver";
  readonly requestFull?: boolean;
  readonly delivery?: "descriptor";
}

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
  historySync?: HistorySyncPolicyPatch;
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
  | "historySync.delivery"
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
    "historySync.delivery"?: ConfigurationSource;
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
