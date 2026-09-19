import { organization } from "../../../../lib/polymorfa.js";
import { route } from "../../../../lib/route.js";

export const GET = route("admin", async () => {
  const billing = organization().billing;
  const [balance, usage, transactions, pricing] = await Promise.all([
    billing.retrieve(),
    billing.usage(),
    billing.listTransactions(),
    billing.listPricing(),
  ]);
  return {
    balance: balance.data.data,
    usage: usage.data.data,
    transactions: transactions.data.data,
    pricing: pricing.data.data,
  };
});
