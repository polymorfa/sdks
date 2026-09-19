"use client";

import { DialPad } from "@polymorfa/react";

import type { CallRecord } from "../../lib/desk/types.js";
import { useCalls } from "../calls-context.js";
import { useDesk } from "../context.js";
import { useResource } from "../data.js";
import { dateTime, duration, formatPhone } from "../format.js";
import { Icon } from "../icons.js";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  IconButton,
  PageHeader,
  Spinner,
  cx,
} from "../kit.js";

export function CallsPage() {
  const calls = useCalls();
  const { bootstrap, settings } = useDesk();
  const history = useResource<readonly CallRecord[]>("/api/desk/calls");
  const connection = bootstrap.connections[0];

  return (
    <div className="page">
      <PageHeader
        title="Calls"
        description="WhatsApp voice and video calls, answered in the browser."
        actions={
          calls?.simulateIncoming && (
            <Button
              icon="phone"
              onClick={() => calls.simulateIncoming?.("+14155550123", false)}
            >
              Simulate incoming call
            </Button>
          )
        }
      />
      <div className="calls-layout">
        <Card className="dialer">
          <div className="dialer-head">
            <span
              className="connection-icon"
              style={{ background: connection?.color }}
            >
              <Icon name="phone" size={18} />
            </span>
            <div>
              <strong>Calling from {connection?.name ?? "your number"}</strong>
              <p className="muted small">{formatPhone(connection?.phone)}</p>
            </div>
          </div>
          {calls ? (
            <DialPad controller={calls.controller} defaultValue="+1415555" />
          ) : (
            <Spinner label="Preparing calls" />
          )}
          <p className="muted small dialer-note">
            Calls use a short-lived browser token; the server key never reaches
            the page.
          </p>
        </Card>
        <Card title="Recent calls" className="flush">
          {!history.data ? (
            <Spinner />
          ) : history.data.length === 0 ? (
            <EmptyState icon="phone" title="No calls yet" />
          ) : (
            <ul className="call-list">
              {history.data.map((call) => (
                <li key={call.id} className="call-row">
                  <Avatar name={call.name ?? call.peer} size={40} />
                  <div className="grow">
                    <strong
                      className={cx(call.outcome === "missed" && "is-danger")}
                    >
                      {call.name ?? formatPhone(call.peer)}
                    </strong>
                    <span className="call-meta">
                      <Icon
                        name={call.video ? "video" : "phone"}
                        size={14}
                        className={cx("call-dir", `is-${call.outcome}`)}
                      />
                      {call.direction === "incoming" ? "Incoming" : "Outgoing"}{" "}
                      ·{" "}
                      {call.outcome === "answered"
                        ? duration(call.durationSeconds)
                        : call.outcome}
                    </span>
                  </div>
                  <span className="muted small hide-xs">
                    {dateTime(call.at, settings.locale)}
                  </span>
                  <IconButton
                    icon={call.video ? "video" : "phone"}
                    label={`Call ${call.name ?? call.peer}`}
                    disabled={!calls}
                    onClick={() =>
                      void calls?.controller.place(call.peer, {
                        video: call.video,
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
