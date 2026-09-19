"use client";

import {
  TemplateBuilderController,
  createSameOriginTemplateBuilderTransport,
  type RenderedTemplate,
} from "@polymorfa/browser";
import { TemplateBuilder } from "@polymorfa/react";
import { useState } from "react";

import type { DeskTemplate } from "../../lib/desk/types.js";
import { useDesk } from "../context.js";
import { useLiveEvents, useResource } from "../data.js";
import { relative } from "../format.js";
import { Icon } from "../icons.js";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  PageHeader,
  Spinner,
  Tabs,
  cx,
  toast,
} from "../kit.js";
import { TemplatePreview, statusTone } from "../tickets/template-picker.js";

function createBuilder(): TemplateBuilderController {
  const builder = new TemplateBuilderController(
    createSameOriginTemplateBuilderTransport({
      path: "/api/polymorfa/templates",
    }),
  );
  builder.create({
    name: "order_ready",
    definition: {
      version: 1,
      kind: "standard",
      category: "UTILITY",
      language: "en_US",
      header: { format: "text", text: "Your order is ready" },
      body: "Hi {{name}}, order {{order}} is ready for pickup.",
      footer: "Acme Support",
      buttons: [
        { type: "url", text: "Track order", url: "https://acme.test/orders" },
        { type: "quick_reply", text: "Talk to an agent" },
      ],
      variables: [
        { name: "name", type: "text", example: "Ada" },
        { name: "order", type: "text", example: "A-1042" },
      ],
    },
    sampleValues: { name: "Ada", order: "A-1042" },
  });
  return builder;
}

function renderPreview(preview: RenderedTemplate) {
  return (
    <TemplatePreview
      template={{
        ...(preview.header?.text ? { header: preview.header.text } : {}),
        body: preview.body,
        ...(preview.footer ? { footer: preview.footer } : {}),
        buttons: preview.buttons.map((button) => button.text),
      }}
      values={{}}
    />
  );
}

export function TemplatesPage() {
  const { settings } = useDesk();
  const templates = useResource<readonly DeskTemplate[]>("/api/desk/templates");
  const [tab, setTab] = useState<"library" | "builder">("library");
  const [selectedId, setSelectedId] = useState<string>();

  // Meta's review result arrives as a `template.status` webhook.
  useLiveEvents({
    "template.status": ({ payload }) => {
      toast(
        `Template ${payload.templateName} is now ${payload.status.toLowerCase()}`,
      );
      templates.reload();
    },
  });

  const selected =
    templates.data?.find((template) => template.id === selectedId) ??
    templates.data?.[0];

  return (
    <div className="page">
      <PageHeader
        title="Templates"
        description="Pre-approved messages for starting conversations and campaigns."
        actions={
          <Button
            variant="primary"
            icon="plus"
            onClick={() => setTab("builder")}
          >
            New template
          </Button>
        }
      />
      <Tabs
        label="Templates view"
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: "library",
            label: "Library",
            ...(templates.data ? { count: templates.data.length } : {}),
          },
          { id: "builder", label: "Builder" },
        ]}
      />
      {tab === "library" ? (
        templates.error ? (
          <ErrorState error={templates.error} onRetry={templates.reload} />
        ) : !templates.data ? (
          <Spinner />
        ) : (
          <div className="split">
            <ul className="template-list">
              {templates.data.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    className={cx(
                      "template-row",
                      template.id === selected?.id && "is-selected",
                    )}
                    aria-current={
                      template.id === selected?.id ? "true" : undefined
                    }
                    onClick={() => setSelectedId(template.id)}
                  >
                    <span className="template-row-top">
                      <strong>{template.name}</strong>
                      <Badge tone={statusTone(template.status)} dot>
                        {template.status.toLowerCase()}
                      </Badge>
                    </span>
                    <span className="template-row-body">{template.body}</span>
                    <span className="template-row-meta">
                      <span>{template.category.toLowerCase()}</span>
                      <span>{template.language}</span>
                      <span>Updated {relative(template.updatedAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {selected && (
              <Card className="template-detail">
                <div className="template-detail-head">
                  <div>
                    <h2>{selected.name}</h2>
                    <p className="muted small">
                      {selected.category} · {selected.language} ·{" "}
                      {selected.variables.length} parameters
                    </p>
                  </div>
                  <Badge tone={statusTone(selected.status)} dot>
                    {selected.status.toLowerCase()}
                  </Badge>
                </div>
                {selected.status === "REJECTED" && (
                  <p className="callout is-danger">
                    <Icon name="alert" size={16} /> Meta rejected this template.
                    Edit it in the builder and submit again.
                  </p>
                )}
                <div className="stage">
                  <TemplatePreview
                    template={selected}
                    values={Object.fromEntries(
                      selected.variables.map((name) => [
                        name,
                        name === "name" ? "Ada" : `‹${name}›`,
                      ]),
                    )}
                  />
                </div>
                <p className="muted small">
                  Last updated{" "}
                  {new Date(selected.updatedAt).toLocaleString(settings.locale)}
                </p>
              </Card>
            )}
          </div>
        )
      ) : (
        <div className="builder-frame">
          <div className="builder-intro">
            <Icon name="templates" size={18} />
            <p>
              Draft, preview and submit a template for Meta review. Previews
              render on the right as the customer will see them.
            </p>
          </div>
          <TemplateBuilder
            createController={createBuilder}
            renderPreview={renderPreview}
            className="builder"
          />
        </div>
      )}
    </div>
  );
}
