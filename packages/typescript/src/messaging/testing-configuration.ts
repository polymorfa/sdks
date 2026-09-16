/** Initial identity of an isolated simulated account. No real credentials or message content. */
export interface TestingConfiguration {
  profile?: { name?: string; status?: string };
  accountType?: "personal" | "business";
  replyBehavior?: "off" | "echo";
  failureScenario?: "none" | "reject-send";
  historyFixtureId?: string;
}
export type TestingConfigurationField =
  | "profile.name"
  | "profile.status"
  | "accountType"
  | "replyBehavior"
  | "failureScenario"
  | "historyFixtureId";

export interface TestingHistoryMessage {
  id: string;
  senderPhone: string;
  text: string;
  timestamp: number;
  fromMe: boolean;
}
