import { describe, it, beforeAll, afterAll } from "vitest";

import { memoryAdapter } from "../src/index.js";
import { defineStorageConformance } from "../src/conformance.js";

defineStorageConformance({ describe, it, beforeAll, afterAll }, "memory", () =>
  memoryAdapter(),
);
