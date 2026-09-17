import { createTemplateBuilderRoute } from "@polymorfa/nextjs";

import { authenticate } from "../../../../lib/auth.js";
import { demoTemplateResource } from "../../../../lib/desk/demo-templates.js";
import { env, isDemoMode } from "../../../../lib/env.js";
import { messaging } from "../../../../lib/polymorfa.js";
import { errorResponse } from "../../../../lib/route.js";

let handler: ((request: Request) => Promise<Response>) | undefined;

// Load, save, preview, submit and delete for the TemplateBuilder component.
export function POST(request: Request): Promise<Response> {
  try {
    const demo = isDemoMode();
    handler ??= createTemplateBuilderRoute({
      templates: demo ? demoTemplateResource : messaging().templates,
      authorize: async (request) => {
        const operator = await authenticate(request);
        return operator === null ? null : { userId: operator.userId };
      },
      resolveProjectSlug: () => (demo ? "demo" : env.projectSlug()),
      resolveSubmissionSession: () => (demo ? "demo" : env.templateSession()),
    });
  } catch (error) {
    return Promise.resolve(errorResponse(error));
  }
  return handler(request);
}
