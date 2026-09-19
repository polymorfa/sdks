"use client";

import { useState } from "react";

import { playNotification, useDesk, type ThemePreference } from "../context.js";
import { clearDeviceConversationCache } from "../../lib/browser/conversation-cache.js";
import { callApi, useResource } from "../data.js";
import { Icon } from "../icons.js";
import {
  Badge,
  Button,
  Card,
  PageHeader,
  Segmented,
  Select,
  Switch,
  cx,
  errorMessage,
  toast,
} from "../kit.js";

const ACCENTS = [
  { name: "WhatsApp green", value: "#00a884" },
  { name: "Ocean", value: "#0284c7" },
  { name: "Indigo", value: "#4f46e5" },
  { name: "Violet", value: "#7c3aed" },
  { name: "Rose", value: "#e11d48" },
  { name: "Amber", value: "#d97706" },
];

const LOCALES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "es-ES", label: "Español" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "de-DE", label: "Deutsch" },
  { value: "ar", label: "العربية (right to left)" },
  { value: "he", label: "עברית (right to left)" },
];

function SessionSettings() {
  const { bootstrap } = useDesk();
  const settings = useResource<Record<string, unknown>>("/api/admin/settings");
  const [mode, setMode] = useState<"metadata_only" | "deliver">(
    "metadata_only",
  );
  const [busy, setBusy] = useState(false);
  const project = ((
    settings.data?.sessionConfiguration as Record<string, unknown> | undefined
  )?.project ?? {}) as { revision?: number; data?: { revision?: number } };
  const revision = project.revision ?? project.data?.revision ?? 0;

  const save = async () => {
    const session = bootstrap.connections[0]?.id;
    if (session === undefined) {
      toast("Connect a WhatsApp session first", "danger");
      return;
    }
    setBusy(true);
    try {
      await callApi("/api/messaging/sessions", {
        action: "configure",
        session,
        historySync: { mode },
        revision,
      });
      toast("Session configuration saved", "success");
    } catch (error) {
      toast(errorMessage(error), "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Session configuration">
      <div className="form-stack">
        <p className="muted">
          Controls what WhatsApp history the session shares with this app when a
          phone links.
        </p>
        <Segmented
          label="History sync"
          value={mode}
          onChange={setMode}
          options={[
            { id: "metadata_only", label: "Metadata only" },
            { id: "deliver", label: "Deliver messages" },
          ]}
        />
        <div className="row-between">
          <span className="muted small">
            Applies to {bootstrap.connections[0]?.name ?? "the default session"}{" "}
            · revision {revision}
          </span>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function SettingsPage() {
  const { settings, updateSettings, isAdmin, dark } = useDesk();
  const custom = !ACCENTS.some((accent) => accent.value === settings.accent);
  return (
    <div className="page page-narrow">
      <PageHeader
        title="Settings"
        description="Personal preferences for this browser."
      />
      <Card title="Appearance">
        <div className="form-stack">
          <div className="setting">
            <div>
              <span className="setting-label">Theme</span>
              <p className="muted small">
                Currently {dark ? "dark" : "light"}.
              </p>
            </div>
            <Segmented<ThemePreference>
              label="Theme"
              value={settings.theme}
              onChange={(theme) => updateSettings({ theme })}
              options={[
                { id: "light", label: "Light", icon: "sun" },
                { id: "dark", label: "Dark", icon: "moon" },
                { id: "system", label: "System", icon: "settings" },
              ]}
            />
          </div>
          <div className="setting">
            <div>
              <span className="setting-label">Accent color</span>
              <p className="muted small">
                Used by buttons, links and the chat components.
              </p>
            </div>
            <div
              className="swatches"
              role="radiogroup"
              aria-label="Accent color"
            >
              {ACCENTS.map((accent) => (
                <button
                  key={accent.value}
                  type="button"
                  role="radio"
                  aria-checked={settings.accent === accent.value}
                  aria-label={accent.name}
                  title={accent.name}
                  className={cx(
                    "swatch-btn",
                    settings.accent === accent.value && "is-selected",
                  )}
                  style={{ background: accent.value }}
                  onClick={() => updateSettings({ accent: accent.value })}
                />
              ))}
              <label
                className={cx(
                  "swatch-btn swatch-custom",
                  custom && "is-selected",
                )}
                title="Custom color"
              >
                <span className="sr-only">Custom color</span>
                <input
                  type="color"
                  value={settings.accent}
                  onChange={(event) =>
                    updateSettings({ accent: event.currentTarget.value })
                  }
                />
                <Icon name="plus" size={14} />
              </label>
            </div>
          </div>
          <div className="setting">
            <div>
              <span className="setting-label">Density</span>
              <p className="muted small">
                Compact fits more tickets on screen.
              </p>
            </div>
            <Segmented
              label="Density"
              value={settings.density}
              onChange={(density) => updateSettings({ density })}
              options={[
                { id: "comfortable", label: "Comfortable" },
                { id: "compact", label: "Compact" },
              ]}
            />
          </div>
        </div>
      </Card>
      <Card title="Language and region">
        <div className="setting">
          <div>
            <label className="setting-label" htmlFor="locale">
              Language
            </label>
            <p className="muted small">
              Sets date formats, component text and text direction.
            </p>
          </div>
          <Select
            id="locale"
            label="Language"
            icon="globe"
            value={settings.locale}
            onChange={(locale) => updateSettings({ locale })}
            options={LOCALES}
          />
        </div>
      </Card>
      <Card title="Notifications">
        <Switch
          label="Sound for new messages"
          description="Plays a short tone when a customer writes."
          checked={settings.sound}
          onChange={(sound) => updateSettings({ sound })}
        />
        <div>
          <Button size="sm" icon="bell" onClick={playNotification}>
            Play test sound
          </Button>
        </div>
      </Card>
      <Card title="Privacy">
        <Switch
          label="Cache conversations on this device"
          description="Opens chats instantly from a local copy, then refreshes them. The copy is removed when you turn this off or sign out."
          checked={settings.cacheConversations}
          onChange={(cacheConversations) => {
            updateSettings({ cacheConversations });
            if (!cacheConversations) {
              void clearDeviceConversationCache().then(() =>
                toast("Cached conversations removed", "success"),
              );
            }
          }}
        />
      </Card>
      {isAdmin && <SessionSettings />}
      <Card title="Developer">
        <div className="setting">
          <div>
            <span className="setting-label">Web Components</span>
            <p className="muted small">
              The same chat and template controllers as framework-free custom
              elements.
            </p>
          </div>
          <a className="btn btn-secondary btn-md" href="/elements">
            <Icon name="code" size={18} /> Open demo
          </a>
        </div>
        <div className="setting">
          <div>
            <span className="setting-label">Development assistant</span>
            <p className="muted small">
              Collapsed in the bottom-left corner during <code>next dev</code>.
            </p>
          </div>
          <Badge
            tone={
              process.env.NODE_ENV === "development" ? "success" : "neutral"
            }
          >
            {process.env.NODE_ENV === "development"
              ? "Available"
              : "Off in production"}
          </Badge>
        </div>
      </Card>
    </div>
  );
}
