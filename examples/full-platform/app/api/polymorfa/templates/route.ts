import { createTemplateBuilderRoute } from "@polymorfa/nextjs";

import { authenticate } from "../../../../lib/auth.js";
import { env } from "../../../../lib/env.js";
import { messaging } from "../../../../lib/polymorfa.js";
import { errorResponse } from "../../../../lib/route.js";

let handler: ((request: Request) => Promise<Response>) | undefined;

// Load, save, preview, submit and delete for the TemplateBuilder component.
export function POST(request: Request): Promise<Response> {
  try {
    handler ??= createTemplateBuilderRoute({
      templates: messaging().templates,
      authorize: async (request) => {
        const operator = await authenticate(request);
        return operator === null ? null : { userId: operator.userId };
      },
      resolveProjectSlug: () => env.projectSlug(),
      resolveSubmissionSession: () => env.templateSession(),
    });
  } catch (error) {
    return Promise.resolve(errorResponse(error));
  }
  return handler(request);
}
