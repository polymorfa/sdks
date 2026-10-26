"use client";
import { Inbox, PolymorfaProvider } from "@polymorfa/ui-kit/react";

export default function InboxPage() {
  return (
    <PolymorfaProvider tokenEndpoint="/api/polymorfa/token">
      <div style={{ height: "100dvh", padding: 16 }}>
        <Inbox />
      </div>
    </PolymorfaProvider>
  );
}
