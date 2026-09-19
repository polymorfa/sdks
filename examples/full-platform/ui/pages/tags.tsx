"use client";

import { useState } from "react";

import { TAG_COLORS, tagColor, type Tag } from "../../lib/desk/types.js";
import { useDesk } from "../context.js";
import { callApi, useResource } from "../data.js";
import {
  Button,
  DataTable,
  ErrorState,
  IconButton,
  Modal,
  PageHeader,
  Spinner,
  TagChip,
  cx,
  errorMessage,
  toast,
} from "../kit.js";

export function TagsPage() {
  const { setBootstrap } = useDesk();
  const tags = useResource<readonly Tag[]>("/api/desk/tags");
  const [editing, setEditing] = useState<{
    id?: string;
    name: string;
    color: number;
  }>();
  const [busy, setBusy] = useState(false);

  const sync = async () => {
    const next = await callApi<readonly Tag[]>("/api/desk/tags");
    tags.setData(() => next);
    setBootstrap((current) => ({ ...current, tags: next }));
  };

  const save = async () => {
    if (!editing?.name.trim()) return;
    setBusy(true);
    try {
      await callApi("/api/desk/tags", {
        action: "save",
        ...editing,
        name: editing.name.trim(),
      });
      toast(editing.id ? "Tag updated" : "Tag created", "success");
      setEditing(undefined);
      await sync();
    } catch (error) {
      toast(errorMessage(error), "danger");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tag: Tag) => {
    if (
      !window.confirm(
        `Delete the "${tag.name}" tag? It is removed from ${tag.chatCount} chats.`,
      )
    )
      return;
    try {
      await callApi("/api/desk/tags", { action: "delete", id: tag.id });
      await sync();
    } catch (error) {
      toast(errorMessage(error), "danger");
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Tags"
        description="WhatsApp Business labels. Changes sync to the phone."
        actions={
          <Button
            variant="primary"
            icon="plus"
            onClick={() => setEditing({ name: "", color: 5 })}
          >
            New tag
          </Button>
        }
      />
      {tags.error ? (
        <ErrorState error={tags.error} onRetry={tags.reload} />
      ) : !tags.data ? (
        <Spinner />
      ) : (
        <div className="card flush">
          <DataTable
            caption="Tags"
            rows={tags.data}
            rowKey={(row) => row.id}
            empty="No tags yet."
            columns={[
              {
                key: "name",
                label: "Tag",
                render: (row) => (
                  <TagChip name={row.name} color={tagColor(row.color)} />
                ),
              },
              { key: "count", label: "Chats", render: (row) => row.chatCount },
              {
                key: "actions",
                label: "",
                className: "cell-action",
                render: (row) => (
                  <span className="row-actions">
                    <IconButton
                      icon="edit"
                      label={`Edit ${row.name}`}
                      onClick={() =>
                        setEditing({
                          id: row.id,
                          name: row.name,
                          color: row.color,
                        })
                      }
                    />
                    <IconButton
                      icon="trash"
                      label={`Delete ${row.name}`}
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
          title={editing.id ? "Edit tag" : "New tag"}
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
                disabled={!editing.name.trim()}
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
              <label htmlFor="tag-name">Name</label>
              <input
                id="tag-name"
                className="input"
                autoFocus
                maxLength={40}
                value={editing.name}
                onChange={(event) => {
                  const name = event.currentTarget.value;
                  setEditing((current) => current && { ...current, name });
                }}
              />
            </div>
            <fieldset className="plain-fieldset">
              <legend className="label">Color</legend>
              <div className="swatches">
                {TAG_COLORS.map((hex, index) => (
                  <button
                    key={hex}
                    type="button"
                    className={cx(
                      "swatch-btn",
                      index === editing.color && "is-selected",
                    )}
                    style={{ background: hex }}
                    aria-label={`Color ${index + 1}`}
                    aria-pressed={index === editing.color}
                    onClick={() =>
                      setEditing(
                        (current) => current && { ...current, color: index },
                      )
                    }
                  />
                ))}
              </div>
            </fieldset>
            <div className="field">
              <span className="label">Preview</span>
              <span>
                <TagChip
                  name={editing.name || "Tag name"}
                  color={tagColor(editing.color)}
                />
              </span>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
