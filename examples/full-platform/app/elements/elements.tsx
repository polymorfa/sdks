"use client";

import {
  ConversationController,
  TemplateBuilderController,
  createSameOriginTemplateBuilderTransport,
  type ConversationPage,
} from "@polymorfa/browser";
import type {
  PolymorfaMessageListElement,
  PolymorfaTemplateBuilderElement,
} from "@polymorfa/elements";
import { createLocale } from "@polymorfa/ui";
import { createElement, useEffect, useRef } from "react";

import { callApi } from "../../lib/browser/api.js";

export function ElementsDemo() {
  const list = useRef<PolymorfaMessageListElement>(null);
  const builder = useRef<PolymorfaTemplateBuilderElement>(null);

  useEffect(() => {
    let disposed = false;
    const conversation = new ConversationController({
      load: (_cursor, signal) =>
        callApi<ConversationPage>(
          "/api/messaging/inbox?chat=%2B15550100",
          undefined,
          signal === undefined ? {} : { signal },
        ),
      subscribe: () => () => undefined,
      send: () => Promise.reject(new Error("Read-only preview.")),
    });
    const templates = new TemplateBuilderController(
      createSameOriginTemplateBuilderTransport({
        path: "/api/polymorfa/templates",
      }),
    );

    // Custom elements touch `HTMLElement`, so load them in the browser only.
    void import("@polymorfa/elements").then(({ definePolymorfaElements }) => {
      if (disposed) return;
      definePolymorfaElements();
      const configuration = {
        appearance: { theme: "dark" as const },
        locale: createLocale("en"),
      };
      if (list.current) {
        list.current.configuration = configuration;
        list.current.controller = conversation;
      }
      if (builder.current) {
        builder.current.configuration = configuration;
        builder.current.controller = templates;
      }
      void conversation.load();
    });

    return () => {
      disposed = true;
      conversation.dispose();
      templates.dispose();
    };
  }, []);

  return (
    <>
      {createElement("pmfa-message-list", { ref: list })}
      {createElement("pmfa-template-builder", { ref: builder })}
    </>
  );
}
