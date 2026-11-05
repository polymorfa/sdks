import { createD1StorageBridge } from "@polymorfa/storage/d1-bridge";
import type { D1DatabaseLike } from "@polymorfa/storage/d1";

interface Environment {
  readonly DB: D1DatabaseLike;
  readonly STORAGE_AUTHORITY: string;
  readonly STORAGE_TABLE_PREFIX: string;
  readonly STORAGE_APPLICATION_SECRET: string;
}

// Bind these values in the customer's Worker deployment. Never derive an
// authority, prefix or secret from a browser, query string or API credential.
export default {
  fetch(request: Request, env: Environment): Promise<Response> {
    return createD1StorageBridge({
      database: env.DB,
      authority: env.STORAGE_AUTHORITY,
      tablePrefix: env.STORAGE_TABLE_PREFIX,
      secret: env.STORAGE_APPLICATION_SECRET,
      allowSetup: false,
    }).fetch(request);
  },
};
