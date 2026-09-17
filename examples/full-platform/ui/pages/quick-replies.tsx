"use client";

import { useState } from "react";

import type { QuickReply } from "../../lib/desk/types.js";
import { useDesk } from "../context.js";
import { callApi, useResource } from "../data.js";
import { Icon } from "../icons.js";
import {
  Button,
  DataTable,
  ErrorState,
  IconButton,
  Modal,
  PageHeader,
  Spinner,
  errorMessage,
  toast,
} from "../kit.js";

export function QuickRepliesPage() {
  const { setBootstrap } = useDesk();
  const replies = useResource<readonly QuickReply[]>("/api/desk/quick-replies");
  const [editing, setEditing] = useState<Partial<QuickReply>>();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const sync = async () => {
    replies.reload();
    const quickReplies = await callApi<readonly QuickReply[]>(
      "/api/desk/quick-replies",
    );
    setBootstrap((current) => ({ ...current, quickReplies }));
  };

  const save = async () => {
    if (!editing?.shortcut?.trim() || !editing.message?.trim()) return;
    setBusy(true);
    try {
      await callApi("/api/desk/quick-replies", {
        action: "save",
        ...(editing.id ? { id: editing.id } : {}),
        shortcut: editing.shortcut,
        message: editing.message,
      });
      toast(
        editing.id ? "Quick reply updated" : "Quick reply created",
        "success",
      );
      setEditing(undefined);
      await sync();
    } catch (error) {
      toast(errorMessage(error), "danger");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (reply: QuickReply) => {
    if (!window.confirm(`Delete /${reply.shortcut}?`)) return;
    try {
      await callApi("/api/desk/quick-replies", {
        action: "delete",
        id: reply.id,
      });
      await sync();
    } catch (error) {
      toast(errorMessage(error), "danger");
    }
  };

  const rows = (replies.data ?? []).filter(
    (reply) =>
      reply.shortcut.includes(search.toLowerCase()) ||
      reply.message.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="page">
      <PageHeader
        title="Quick replies"
        description="Type / in the composer to insert one. Saved to the WhatsApp Business account."
        actions={
          <Button
            variant="primary"
            icon="plus"
            onClick={() => setEditing({ shortcut: "", message: "" })}
          >
            New quick reply
          </Button>
        }
      />
      <div className="toolbar">
        <label className="search-input grow">
          <Icon name="search" size={16} />
          <span className="sr-only">Search quick replies</span>
          <input
            type="search"
            placeholder="Search shortcuts and text"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </label>
      </div>
      {replies.error ? (
        <ErrorState error={replies.error} onRetry={replies.reload} />
      ) : !replies.data ? (
        <Spinner />
      ) : (
        <div className="card flush">
          <DataTable
            caption="Quick replies"
            rows={rows}
            rowKey={(row) => row.id}
            empty="No quick replies yet."
            columns={[
              {
                key: "shortcut",
                label: "Shortcut",
                render: (row) => (
                  <kbd className="shortcut">/{row.shortcut}</kbd>
                ),
              },
              {
                key: "message",
                label: "Message",
                render: (row) => <span className="clamp-2">{row.message}</span>,
              },
              {
                key: "actions",
                label: "",
                className: "cell-action",
                render: (row) => (
                  <span className="row-actions">
                    <IconButton
                      icon="edit"
                      label={`Edit /${row.shortcut}`}
                      onClick={() => setEditing(row)}
                    />
                    <IconButton
                      icon="trash"
                      label={`Delete /${row.shortcut}`}
                      onClick={() => void remove(row)}
                    />
                  </span>
                ),
              },
            ]}
          />
        </div>
      )}
      {editing && (
        <Modal
          title={editing.id ? "Edit quick reply" : "New quick reply"}
          size="sm"
          onClose={() => setEditing(undefined)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(undefined)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={busy}
                disabled={!editing.shortcut?.trim() || !editing.message?.trim()}
                onClick={() => void save()}
              >
                Save
              </Button>
            </>
          }
        >
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="field">
              <label htmlFor="qr-shortcut">Shortcut</label>
              <div className="input-prefix">
                <span>/</span>
                <input
                  id="qr-shortcut"
                  className="input"
                  autoFocus
                  maxLength={25}
                  pattern="[\w\-]{1,25}"
                  value={editing.shortcut ?? ""}
                  onChange={(event) => {
                    const shortcut = event.currentTarget.value;
                    setEditing((current) => ({ ...current, shortcut }));
                  }}
                />
              </div>
              <p className="field-hint">
                Letters, numbers, dashes and underscores.
              </p>
            </div>
            <div className="field">
              <label htmlFor="qr-message">Message</label>
              <textarea
                id="qr-message"
                className="input"
                rows={5}
                maxLength={1024}
                value={editing.message ?? ""}
                onChange={(event) => {
                  const message = event.currentTarget.value;
                  setEditing((current) => ({ ...current, message }));
                }}
              />
              <p className="field-hint">
                {(editing.message ?? "").length}/1024
              </p>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
