import { QuickLinkController } from "@polymorfa/browser";
import { PolymorfaProvider, QuickLink } from "@polymorfa/react";

const quickLink = new QuickLinkController({
  create: async () => ({
    id: "quicklink_1",
    link: "https://example.test/connect",
    expiresAt: Date.now() + 60_000,
  }),
  recover: async () => ({
    id: "quicklink_1",
    link: "https://example.test/connect",
    expiresAt: Date.now() + 60_000,
  }),
  cancel: async () => undefined,
  subscribe: () => () => undefined,
});

export function App() {
  return (
    <PolymorfaProvider
      appearance={{ theme: "system", variables: { colorPrimary: "#5b4bf7" } }}
    >
      <QuickLink controller={quickLink} />
    </PolymorfaProvider>
  );
}
