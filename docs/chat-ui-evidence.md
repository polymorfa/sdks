# Chat window UI evidence

Rendered in the synthetic Console integration against this candidate SDK core.
No regional reads, credentials, remote uploads or WhatsApp sends. The media
fixture uses a local file and Blob URL. Chromium captured full-length PNGs at
2x scale. Exact source revisions and viewports are recorded in
[the capture manifest](images/chat-window/manifest.json).

## Desktop

![SDK-owned inline chat](images/chat-window/chats-desktop-2x.png)

## Mobile

![Mobile chat with fixed composer](images/chat-window/chats-mobile-2x.png)

## Media choices

![Photos, Videos, Audio and Documents picker](images/chat-window/chats-media-picker-desktop-2x.png)

![Mobile attachment choices](images/chat-window/chats-media-picker-mobile-2x.png)

## Media draft

![Image preview and caption before sending](images/chat-window/chats-media-draft-desktop-2x.png)

## Failed send

![Failed send preserves the draft](images/chat-window/chats-failed-send-2x.png)

## Native inbox

![Mobile inbox with observed unread rows](images/chat-window/chats-inbox-mobile-2x.png)

![Host-provided action menu](images/chat-window/chats-actions-desktop-2x.png)

![Actual SDK draft previews](images/chat-window/chats-drafts-desktop-2x.png)

![Inline quoted reply](images/chat-window/chats-reply-desktop-2x.png)

![Mutation failure preserves observed state](images/chat-window/chats-action-failed-desktop-2x.png)

![Dark theme and unread badge contrast](images/chat-window/chats-dark-desktop-2x.png)

Action menus acknowledge local sample callbacks only. WhatsApp synchronization
requires authorized host adapters and supported producer contracts; it is not
performed by this preview.
