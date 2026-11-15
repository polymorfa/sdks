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
export interface ConnectionConfigurationOverrides {
  observation?: Partial<ObservationConfiguration>;
  historySync?: HistorySyncPolicyPatch;
  /** Atomic policy replacement; enabling requires separate live authorization. */
  hms?: HmsConfiguration;
}

export interface EffectiveConnectionConfiguration {
  observation: ObservationConfiguration;
  historySync: HistorySyncPolicy;
  hms: HmsConfiguration;
}

export type ConfigurationSource = "platform" | "team" | "project" | "connection";
export type ConfigurationValueSource = ConfigurationSource | "consent";
export type ConnectionConfigurationReset =
  | "historySync"
  | "historySync.mode"
  | "historySync.requestFull"
  | "historySync.delivery"
  | "hms"
  | "observation"
  | `observation.${keyof ObservationConfiguration}`;
export interface ConnectionConfigurationPatch {
  set?: ConnectionConfigurationOverrides;
  reset?: ConnectionConfigurationReset[];
}
export interface ResolvedConnectionConfiguration {
  effective: EffectiveConnectionConfiguration;
  overrides: ConnectionConfigurationOverrides;
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

export interface ConnectionConfigurationView extends ResolvedConnectionConfiguration {
  requestedHistory: HistorySyncPolicy;
  historyConsent?: "pending" | "accepted" | "declined";
  revisions: { team: number; project: number; connection: number };
  application?: {
    desiredGeneration: number;
    appliedGeneration: number;
    status: "pending" | "applied";
  };
}
