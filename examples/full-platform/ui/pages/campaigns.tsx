"use client";

import { useState } from "react";

import type { DeskCampaign, DeskTemplate } from "../../lib/desk/types.js";
import { useDesk } from "../context.js";
import { callApi, newClientId, useLiveEvents, useResource } from "../data.js";
import { dateTime, number, percent } from "../format.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Menu,
  Modal,
  PageHeader,
  Segmented,
  Spinner,
  cx,
  errorMessage,
  toast,
} from "../kit.js";
import { TemplatePreview } from "../tickets/template-picker.js";

const STATUS_TONE: Record<
  string,
  "success" | "warning" | "info" | "neutral" | "danger"
> = {
  running: "info",
  completed: "success",
  scheduled: "warning",
  paused: "neutral",
  draft: "neutral",
  stopped: "danger",
};

function Wizard({
  templates,
  onClose,
  onCreated,
}: {
  readonly templates: readonly DeskTemplate[];
  readonly onClose: () => void;
  readonly onCreated: () => void;
}) {
  const { bootstrap } = useDesk();
  const approved = templates.filter(
    (template) => template.status === "APPROVED",
  );
  const [step, setStep] = useState(0);
  const [name, setName] = useState("October product update");
  const [audience, setAudience] = useState<"all" | "tag">("tag");
  const [tag, setTag] = useState(bootstrap.tags[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(approved[0]?.id ?? "");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState(() => {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    date.setMinutes(0, 0, 0);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [busy, setBusy] = useState(false);
  const template = approved.find((item) => item.id === templateId);
  const steps = ["Audience", "Template", "Schedule"];
  const canNext =
    step === 0
      ? name.trim() !== "" && (audience === "all" || tag !== "")
      : step === 1
        ? template !== undefined
        : true;

  const create = async () => {
    setBusy(true);
    try {
      await callApi(
        "/api/desk/campaigns",
        {
          action: "create",
          name: name.trim(),
          templateId,
          audience,
          ...(audience === "tag" ? { tag } : {}),
          ...(when === "later" ? { scheduledAt: new Date(at).getTime() } : {}),
        },
        { idempotencyKey: newClientId() },
      );
      toast(
        when === "later" ? "Campaign scheduled" : "Campaign launched",
        "success",
      );
      onCreated();
    } catch (error) {
      toast(errorMessage(error), "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New campaign"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={step === 0 ? onClose : () => setStep(step - 1)}
          >
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < 2 ? (
            <Button
              variant="primary"
              icon="arrowRight"
              disabled={!canNext}
              onClick={() => setStep(step + 1)}
            >
              Continue
            </Button>
          ) : (
            <Button
              variant="primary"
              icon="send"
              loading={busy}
              onClick={() => void create()}
            >
              {when === "later" ? "Schedule campaign" : "Launch now"}
            </Button>
          )}
        </>
      }
    >
      <ol className="stepper">
        {steps.map((label, index) => (
          <li
            key={label}
            className={cx(
              index === step && "is-current",
              index < step && "is-done",
            )}
            aria-current={index === step ? "step" : undefined}
          >
            <span className="step-dot">{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      {step === 0 && (
        <div className="form-stack">
          <div className="field">
            <label htmlFor="campaign-name">Campaign name</label>
            <input
              id="campaign-name"
              className="input"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </div>
          <Segmented
            label="Audience"
            value={audience}
            onChange={setAudience}
            options={[
              { id: "tag", label: "Contacts with a tag", icon: "tag" },
              { id: "all", label: "All contacts", icon: "contacts" },
            ]}
          />
          {audience === "tag" && (
            <div className="chip-row">
              {bootstrap.tags.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={item.id === tag}
                  className={cx(
                    "choice-chip",
                    item.id === tag && "is-selected",
                  )}
                  onClick={() => setTag(item.id)}
                >
                  {item.name} <span className="muted">{item.chatCount}</span>
                </button>
              ))}
            </div>
          )}
          <p className="muted small">
            Contacts who opted out are skipped automatically. Marketing
            templates count against your messaging limits.
          </p>
        </div>
      )}
      {step === 1 && (
        <div className="wizard-split">
          <ul
            className="option-cards"
            role="listbox"
            aria-label="Approved templates"
          >
            {approved.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={item.id === templateId}
                  className={cx(
                    "tpl-option",
                    item.id === templateId && "is-selected",
                  )}
                  onClick={() => setTemplateId(item.id)}
                >
                  <span className="tpl-option-top">
                    <strong>{item.name}</strong>
                    <Badge>{item.category.toLowerCase()}</Badge>
                  </span>
                  <span className="tpl-option-body">{item.body}</span>
                </button>
              </li>
            ))}
          </ul>
          {template && (
            <TemplatePreview template={template} values={{ name: "Ada" }} />
          )}
        </div>
      )}
      {step === 2 && (
        <div className="form-stack">
          <Segmented
            label="When"
            value={when}
            onChange={setWhen}
            options={[
              { id: "now", label: "Send now", icon: "send" },
              { id: "later", label: "Schedule", icon: "clock" },
            ]}
          />
          {when === "later" && (
            <div className="field">
              <label htmlFor="campaign-at">Send at</label>
              <input
                id="campaign-at"
                type="datetime-local"
                className="input"
                value={at}
                onChange={(event) => setAt(event.currentTarget.value)}
              />
            </div>
          )}
          <dl className="summary">
            <div>
              <dt>Name</dt>
              <dd>{name}</dd>
            </div>
            <div>
              <dt>Audience</dt>
              <dd>
                {audience === "all"
                  ? "All contacts"
                  : bootstrap.tags.find((item) => item.id === tag)?.name}
              </dd>
            </div>
            <div>
              <dt>Template</dt>
              <dd>{template?.name}</dd>
            </div>
          </dl>
        </div>
      )}
    </Modal>
  );
}

export function CampaignsPage() {
  const { settings, isAdmin } = useDesk();
  const campaigns = useResource<readonly DeskCampaign[]>("/api/desk/campaigns");
  const templates = useResource<readonly DeskTemplate[]>("/api/desk/templates");
  const [creating, setCreating] = useState(false);
  const { reload, setData } = campaigns;

  // Progress is pushed by the server as campaigns send.
  useLiveEvents({
    "desk.campaign": ({ payload: event }) =>
      setData((current) =>
        current?.map((campaign) =>
          campaign.id === event.campaign.id ? event.campaign : campaign,
        ),
      ),
    "campaign.completed": () => reload(),
  });

  const control = async (
    campaign: DeskCampaign,
    operation: "launch" | "pause" | "resume" | "stop",
  ) => {
    try {
      await callApi(
        "/api/desk/campaigns",
        { action: "control", campaignId: campaign.id, operation },
        { idempotencyKey: newClientId() },
      );
      reload();
    } catch (error) {
      toast(errorMessage(error), "danger");
    }
  };

  const names = new Map(
    (templates.data ?? []).map((template) => [template.id, template.name]),
  );

  return (
    <div className="page">
      <PageHeader
        title="Campaigns"
        description="Send approved templates to a segment of your contacts."
        actions={
          isAdmin && (
            <Button
              variant="primary"
              icon="plus"
              disabled={!templates.data}
              onClick={() => setCreating(true)}
            >
              New campaign
            </Button>
          )
        }
      />
      {campaigns.error ? (
        <ErrorState error={campaigns.error} onRetry={reload} />
      ) : !campaigns.data ? (
        <Spinner />
      ) : campaigns.data.length === 0 ? (
        <Card>
          <EmptyState
            icon="campaigns"
            title="No campaigns yet"
            action={
              isAdmin && (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Create a campaign
                </Button>
              )
            }
          >
            Reach many customers at once with an approved template.
          </EmptyState>
        </Card>
      ) : (
        <div className="campaign-grid">
          {campaigns.data.map((campaign) => {
            const sent = percent(campaign.sentCount, campaign.recipientCount);
            return (
              <Card key={campaign.id} className="campaign">
                <div className="campaign-top">
                  <div>
                    <h2>{campaign.name}</h2>
                    <p className="muted small">
                      {campaign.templateId
                        ? (names.get(campaign.templateId) ?? "Template")
                        : "No template"}{" "}
                      ·{" "}
                      {campaign.scheduledAt
                        ? dateTime(campaign.scheduledAt, settings.locale)
                        : "Not scheduled"}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[campaign.status] ?? "neutral"} dot>
                    {campaign.status}
                  </Badge>
                </div>
                <div
                  className="progress"
                  role="progressbar"
                  aria-valuenow={sent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${sent}% sent`}
                >
                  <span style={{ width: `${sent}%` }} />
                </div>
                <dl className="campaign-stats">
                  <div>
                    <dt>Recipients</dt>
                    <dd>{number(campaign.recipientCount, settings.locale)}</dd>
                  </div>
                  <div>
                    <dt>Delivered</dt>
                    <dd>
                      {percent(campaign.deliveredCount, campaign.sentCount)}%
                    </dd>
                  </div>
                  <div>
                    <dt>Read</dt>
                    <dd>{percent(campaign.readCount, campaign.sentCount)}%</dd>
                  </div>
                  <div>
                    <dt>Failed</dt>
                    <dd>{number(campaign.failedCount, settings.locale)}</dd>
                  </div>
                </dl>
                {isAdmin && (
                  <div className="campaign-actions">
                    {campaign.status === "running" && (
                      <Button
                        size="sm"
                        icon="pause"
                        onClick={() => void control(campaign, "pause")}
                      >
                        Pause
                      </Button>
                    )}
                    {campaign.status === "paused" && (
                      <Button
                        size="sm"
                        icon="play"
                        onClick={() => void control(campaign, "resume")}
                      >
                        Resume
                      </Button>
                    )}
                    {(campaign.status === "draft" ||
                      campaign.status === "scheduled") && (
                      <Button
                        size="sm"
                        variant="primary"
                        icon="send"
                        disabled={!campaign.templateId}
                        onClick={() => void control(campaign, "launch")}
                      >
                        Launch now
                      </Button>
                    )}
                    {["running", "paused", "scheduled"].includes(
                      campaign.status,
                    ) && (
                      <Menu
                        label={`More actions for ${campaign.name}`}
                        items={[
                          {
                            label: "Stop campaign",
                            icon: "ban",
                            danger: true,
                            onSelect: () => void control(campaign, "stop"),
                          },
                        ]}
                      />
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {creating && templates.data && (
        <Wizard
          templates={templates.data}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
