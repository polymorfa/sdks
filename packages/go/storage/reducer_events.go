package storage

import (
	"encoding/json"
	polymorfa "github.com/polymorfa/sdks/packages/go"
	"strings"
)

// ReduceEvent maps a verified webhook envelope into deterministic schema2 rows.
// Calls, billing, campaigns and presence produce no chat-data writes.
func ReduceEvent(event polymorfa.WebhookEvent) (Batch, error) {
	var payload any
	if len(event.Payload) > 0 && json.Unmarshal(event.Payload, &payload) != nil {
		return Batch{}, invalid()
	}
	p := object(payload)
	at := isoMillis(event.Timestamp)
	session := event.Session
	ops := []Operation{}
	kind := event.Event
	switch kind {
	case "message.received", "message.update", "message.edited":
		ops = messageOperations(session, p, at, kind == "message.edited" || p["edited"] == true)
	case "message.sent":
		ops = sentOperations(session, p)
	case "message.reaction":
		ops = reactionOperations(session, p, at)
	case "message.revoked":
		ops = revokeOperations(session, p, at)
	case "message.delete":
		id, chat := text(p["id"]), text(object(p["conversation"])["id"])
		if id != "" && chat != "" {
			fields := cleared(contentFields)
			put(fields, "chatId", chat, 0)
			put(fields, "deletedAt", at, FinalVersion)
			ops = []Operation{rowOperation("messages", session, map[string]any{"messageId": id}, fields, nil), rowOperation("media", session, map[string]any{"messageId": id}, cleared(mediaSecrets), nil)}
		}
	case "message.ack":
		status := AckStatus(text(p["type"]))
		chat := text(object(p["conversation"])["id"])
		if status != "" && chat != "" {
			timestamp := ToMillis(p["timestamp"])
			if timestamp == nil {
				timestamp = &at
			}
			recipient := text(first(nonempty(object(p["from"])["id"]), nonempty(object(p["sender"])["id"]), chat))
			for _, m := range list(p["messages"]) {
				id := text(object(m)["id"])
				if id == "" {
					continue
				}
				fields := Fields{}
				put(fields, "chatId", chat, 0)
				statusFields(fields, status, timestamp)
				ops = append(ops, rowOperation("messages", session, map[string]any{"messageId": id}, fields, nil))
				receipt := cloneFields(fields)
				receipt["timestamp"] = receipt["statusAt"]
				delete(receipt, "statusAt")
				ops = append(ops, rowOperation("receipts", session, map[string]any{"messageId": id, "recipientId": recipient}, receipt, nil))
			}
		}
	case "message.vote":
		id, voter, chat := text(p["pollMessageId"]), text(object(p["voter"])["id"]), text(object(p["conversation"])["id"])
		if id != "" && voter != "" && chat != "" {
			v := ToMillis(p["timestamp"])
			if v == nil {
				v = &at
			}
			f := Fields{}
			put(f, "chatId", chat, 0)
			hashes := list(p["selectedHashes"])
			if hashes == nil {
				hashes = []any{}
			}
			put(f, "selectedHashes", hashes, *v)
			put(f, "timestamp", *v, *v)
			ops = []Operation{rowOperation("poll_votes", session, map[string]any{"messageId": id, "voterId": voter}, f, nil)}
		}
	case "chat.archive", "chat.mute", "chat.read":
		f := Fields{}
		if kind == "chat.archive" {
			from(f, p, "archived", "archive", at)
			from(f, p, "pinned", "pinned", at)
		}
		if kind == "chat.mute" {
			from(f, p, "muted", "muted", at)
			var end any
			if p["muted"] == true {
				end = valueMillis(p["muteEndTimestamp"])
			}
			put(f, "muteEndAt", end, at)
		}
		if kind == "chat.read" {
			if b, ok := p["read"].(bool); ok {
				put(f, "markedUnread", !b, at)
				if b {
					put(f, "unreadCount", 0, at)
				}
			}
		}
		id := text(object(p["from"])["id"])
		if id != "" && at != 0 && len(f) > 0 {
			ops = []Operation{rowOperation("chats", session, map[string]any{"chatId": id}, f, nil)}
		}
	case "chat.clear", "chat.delete":
		id := text(object(p["from"])["id"])
		if id != "" && at != 0 {
			field := "clearedAt"
			if kind == "chat.delete" {
				field = "deletedAt"
			}
			ops = []Operation{rowOperation("chats", session, map[string]any{"chatId": id}, Fields{field: {at, at}}, nil), {Kind: "clearChat", SessionID: session, ChatID: id, UpTo: at}}
		}
	case "contact.update":
		id := text(p["id"])
		f := Fields{}
		stringsFrom(f, p, []string{"phoneNumber", "bsuid", "username", "fullName", "firstName", "pushName", "businessName"}, at)
		if p["pictureRemoved"] == true {
			put(f, "pictureId", nil, at)
		} else {
			putIf(f, "pictureId", nonempty(p["pictureId"]), at)
		}
		if id != "" && len(f) > 0 {
			ops = []Operation{rowOperation("contacts", session, map[string]any{"contactId": id}, f, nil)}
		}
	case "blocklist.update":
		for _, entry := range list(p["changes"]) {
			c := object(entry)
			id, action := text(c["id"]), strings.ToLower(text(c["action"]))
			if id == "" || action != "block" && action != "unblock" {
				continue
			}
			f := Fields{"blocked": {action == "block", at}}
			putIf(f, "phoneNumber", nonempty(c["phoneNumber"]), at)
			ops = append(ops, rowOperation("contacts", session, map[string]any{"contactId": id}, f, nil))
		}
	case "group.update":
		id := text(p["id"])
		if id != "" {
			f := Fields{}
			putIf(f, "subject", nonempty(p["newSubject"]), at)
			from(f, p, "description", "newDescription", at)
			putIf(f, "lastAction", nonempty(p["action"]), at)
			putIf(f, "inviteLink", nonempty(p["inviteLink"]), at)
			from(f, p, "joinApprovalRequired", "joinApprovalRequired", at)
			chat := Fields{"kind": {"group", 0}}
			putIf(chat, "name", nonempty(p["newSubject"]), at)
			ops = []Operation{rowOperation("groups", session, map[string]any{"groupId": id}, f, nil), rowOperation("chats", session, map[string]any{"chatId": id}, chat, nil)}
		}
	case "group.participant":
		id := text(p["id"])
		if id != "" {
			ops = append(ops, rowOperation("groups", session, map[string]any{"groupId": id}, Fields{}, nil))
			for _, action := range []string{"joined", "left", "promoted", "demoted"} {
				for _, entry := range list(p[action]) {
					participant := object(entry)
					pid := text(participant["id"])
					if pid == "" {
						continue
					}
					f := Fields{}
					switch action {
					case "joined":
						put(f, "active", true, at)
						put(f, "role", "member", at)
						put(f, "leaveReason", nil, at)
					case "left":
						put(f, "active", false, at)
						put(f, "leaveReason", first(nonempty(p["reason"]), "left"), at)
					case "promoted":
						put(f, "role", "admin", at)
					case "demoted":
						put(f, "role", "member", at)
					}
					putIf(f, "phoneNumber", nonempty(participant["phoneNumber"]), at)
					put(f, "changedAt", at, at)
					ops = append(ops, rowOperation("group_participants", session, map[string]any{"groupId": id, "participantId": pid}, f, nil))
				}
			}
		}
	case "labels.update":
		ops = labelOperations(session, p, at)
	case "newsletter.update":
		id := text(p["id"])
		if id != "" {
			f := Fields{"kind": {"channel", 0}}
			from(f, p, "muted", "muted", at)
			ops = []Operation{rowOperation("chats", session, map[string]any{"chatId": id}, f, nil)}
		}
	case "session.connected":
		f := Fields{"connected": {true, at}}
		stringsFrom(f, p, []string{"phoneNumber", "pushName", "phonePlatform", "accountType", "businessName"}, at)
		putIf(f, "waId", nonempty(p["id"]), at)
		ops = []Operation{rowOperation("sessions", session, nil, f, nil)}
	case "session.status":
		if _, ok := p["status"].(string); ok {
			f := Fields{"status": {p["status"], at}, "statusReason": {p["statusReason"], at}}
			ops = []Operation{rowOperation("sessions", session, nil, f, nil)}
		}
	case "session.logged_out":
		f := Fields{"connected": {false, at}}
		putIf(f, "loggedOutReason", nonempty(p["reason"]), at)
		if n, ok := number(p["code"]); ok {
			put(f, "loggedOutCode", n, at)
		}
		ops = []Operation{rowOperation("sessions", session, nil, f, nil)}
	case "history.sync":
		if p["kind"] != "history" {
			ops = historyProgressOperations(session, p)
		}
	}
	return Batch{SessionID: session, EventID: &event.ID, EventType: &event.Event, Operations: ops}, nil
}

type messageIdentity struct {
	id, chat, sender string
	timestamp        *float64
	fromMe           bool
}

func identify(p map[string]any) *messageIdentity {
	conversation := object(p["conversation"])
	id, chat := text(p["id"]), text(conversation["id"])
	if id == "" || chat == "" {
		return nil
	}
	own := p["fromMe"] == true
	sender := SelfID
	if !own {
		sender = text(object(conversation["sender"])["id"])
		if sender == "" && p["isGroup"] != true {
			sender = chat
		}
	}
	return &messageIdentity{id, chat, sender, ToMillis(p["timestamp"]), own}
}
func messageGuard(session string, id *messageIdentity) *Watermark {
	if id.timestamp == nil {
		return nil
	}
	return &Watermark{session, id.chat, *id.timestamp}
}
func chatFromConversation(session string, c map[string]any, group *bool, timestamp *float64) []Operation {
	id := text(c["id"])
	if id == "" {
		return nil
	}
	version := 0.0
	if timestamp != nil {
		version = *timestamp
	}
	f := Fields{}
	if kind := chatKind("", group); kind != "" {
		put(f, "kind", kind, 0)
	}
	if group == nil || !*group {
		stringsFrom(f, c, []string{"phoneNumber", "bsuid", "username"}, version)
	}
	if timestamp != nil {
		put(f, "lastMessageAt", *timestamp, *timestamp)
	}
	return []Operation{rowOperation("chats", session, map[string]any{"chatId": id}, f, nil)}
}
func contentWrites(p map[string]any, version float64) Fields {
	f := Fields{}
	put(f, "text", first(nonempty(p["text"]), nonempty(object(p["text"])["body"])), version)
	for _, key := range []string{"caption", "mimeType", "displayName", "title"} {
		put(f, key, nonempty(p[key]), version)
	}
	put(f, "fileName", nonempty(p["filename"]), version)
	for _, key := range []string{"latitude", "longitude"} {
		var v any
		if n, ok := number(p[key]); ok {
			v = n
		}
		put(f, key, v, version)
	}
	put(f, "pollOptions", jsonValue(p["pollOptions"]), version)
	extra := map[string]any{}
	for _, key := range []string{"ptt", "nativeFlowResponse", "replyChoice", "unavailable", "unavailableReason", "interactive", "referral"} {
		if v, ok := p[key]; ok {
			extra[key] = v
		}
	}
	var v any
	if len(extra) > 0 {
		v = extra
	}
	put(f, "extra", v, version)
	return f
}
func messageOperations(session string, p map[string]any, at float64, edit bool) []Operation {
	id := identify(p)
	if id == nil {
		return nil
	}
	kind := text(p["type"])
	if kind == "reaction" {
		return reactionOperations(session, p, at)
	}
	if kind == "revoke" {
		return revokeOperations(session, p, at)
	}
	f := Fields{"chatId": {id.chat, 0}, "fromMe": {id.fromMe, 0}}
	putIf(f, "senderId", nonempty(id.sender), 0)
	if !edit {
		timestamp := 0.0
		if id.timestamp != nil {
			timestamp = *id.timestamp
		}
		put(f, "timestamp", timestamp, 0)
	}
	ids := object(p["whatsapp_ids"])
	putIf(f, "waMessageId", nonempty(ids["linked_devices"]), 0)
	putIf(f, "cloudMessageId", nonempty(ids["official_api"]), 0)
	putIf(f, "quotedId", nonempty(p["parentMessageId"]), 0)
	if !id.fromMe {
		putIf(f, "pushName", first(nonempty(p["pushName"]), nonempty(p["senderName"])), 0)
	}
	version := 0.0
	if edit {
		version = at
		if id.timestamp != nil {
			version = *id.timestamp
		}
		put(f, "editedAt", version, version)
	} else {
		putIf(f, "type", nonempty(kind), 0)
	}
	for k, w := range contentWrites(p, version) {
		f[k] = w
	}
	var group *bool
	if b, ok := p["isGroup"].(bool); ok {
		group = &b
	}
	timestamp := id.timestamp
	if edit {
		timestamp = nil
	}
	ops := chatFromConversation(session, object(p["conversation"]), group, timestamp)
	guard := messageGuard(session, id)
	ops = append(ops, rowOperation("messages", session, map[string]any{"messageId": id.id}, f, guard))
	if media := eventMediaFields(p, id.chat, version); media != nil {
		ops = append(ops, rowOperation("media", session, map[string]any{"messageId": id.id}, media, guard))
	}
	push := first(nonempty(p["pushName"]), nonempty(p["senderName"]))
	if !id.fromMe && id.sender != "" && push != nil && id.timestamp != nil {
		contact := Fields{"pushName": {push, *id.timestamp}}
		ref := object(p["conversation"])
		if group != nil && *group {
			ref = object(ref["sender"])
		}
		putIf(contact, "phoneNumber", nonempty(ref["phoneNumber"]), *id.timestamp)
		ops = append(ops, rowOperation("contacts", session, map[string]any{"contactId": id.sender}, contact, nil))
	}
	return ops
}
func eventMediaFields(p map[string]any, chat string, version float64) Fields {
	kind := text(p["type"])
	descriptor, download := nonempty(p["media"]), nonempty(p["mediaUrl"])
	media := descriptor != nil || download != nil
	for _, candidate := range []string{"image", "video", "audio", "document", "sticker"} {
		media = media || kind == candidate
	}
	if !media {
		return nil
	}
	f := Fields{"chatId": {chat, 0}}
	putIf(f, "kind", nonempty(kind), 0)
	putIf(f, "mimeType", nonempty(p["mimeType"]), version)
	putIf(f, "fileName", nonempty(p["filename"]), version)
	putIf(f, "descriptor", descriptor, version)
	putIf(f, "downloadUrl", download, version)
	return f
}
func sentOperations(session string, p map[string]any) []Operation {
	p = object(jsonValue(p))
	p["fromMe"] = true
	id := identify(p)
	if id == nil {
		return nil
	}
	timestamp := 0.0
	if id.timestamp != nil {
		timestamp = *id.timestamp
	}
	f := Fields{"chatId": {id.chat, 0}, "fromMe": {true, 0}, "senderId": {SelfID, 0}, "timestamp": {timestamp, 0}}
	putIf(f, "type", nonempty(p["type"]), 0)
	ids := object(p["whatsapp_ids"])
	putIf(f, "waMessageId", nonempty(ids["linked_devices"]), 0)
	putIf(f, "cloudMessageId", nonempty(ids["official_api"]), 0)
	statusFields(f, "sent", id.timestamp)
	ops := chatFromConversation(session, object(p["conversation"]), nil, id.timestamp)
	return append(ops, rowOperation("messages", session, map[string]any{"messageId": id.id}, f, messageGuard(session, id)))
}
func reactionOperations(session string, p map[string]any, at float64) []Operation {
	id := identify(p)
	target := text(p["reactionTo"])
	if id == nil || target == "" || id.sender == "" {
		return nil
	}
	version := at
	if id.timestamp != nil {
		version = *id.timestamp
	}
	f := Fields{"chatId": {id.chat, 0}, "emoji": {text(p["reaction"]), version}, "timestamp": {version, version}}
	return []Operation{rowOperation("reactions", session, map[string]any{"messageId": target, "senderId": id.sender}, f, nil)}
}
func revokeOperations(session string, p map[string]any, at float64) []Operation {
	id := identify(p)
	target := text(p["revokedId"])
	if id == nil || target == "" {
		return nil
	}
	version := at
	if id.timestamp != nil {
		version = *id.timestamp
	}
	f := cleared(contentFields)
	put(f, "chatId", id.chat, 0)
	put(f, "revokedAt", version, FinalVersion)
	return []Operation{rowOperation("messages", session, map[string]any{"messageId": target}, f, nil), rowOperation("media", session, map[string]any{"messageId": target}, cleared(mediaSecrets), nil)}
}
func labelOperations(session string, p map[string]any, at float64) []Operation {
	version := at
	if n := ToMillis(p["observedAt"]); n != nil {
		version = *n
	}
	id, action := text(p["labelId"]), text(p["action"])
	switch action {
	case "label_edit":
		if id == "" {
			return nil
		}
		f := Fields{}
		putIf(f, "name", first(nonempty(p["name"]), nonempty(p["label"])), version)
		for _, k := range []string{"color", "orderIndex"} {
			if n, ok := number(p[k]); ok {
				put(f, k, n, version)
			}
		}
		deleted := p["deleted"]
		if deleted == nil {
			deleted = false
		}
		put(f, "deleted", deleted, version)
		return []Operation{rowOperation("labels", session, map[string]any{"labelId": id}, f, nil)}
	case "label_association_chat", "label_association_message":
		target, kind := text(p["messageId"]), "message"
		if action == "label_association_chat" {
			target = text(object(p["from"])["id"])
			kind = "chat"
		}
		b, ok := p["labeled"].(bool)
		if id == "" || target == "" || !ok {
			return nil
		}
		return []Operation{rowOperation("label_associations", session, map[string]any{"labelId": id, "targetKind": kind, "targetId": target}, Fields{"labeled": {b, version}, "changedAt": {version, version}}, nil)}
	case "star":
		message := text(p["messageId"])
		b, ok := p["starred"].(bool)
		if message == "" || !ok {
			return nil
		}
		f := Fields{"starred": {b, version}}
		putIf(f, "chatId", nonempty(object(p["from"])["id"]), 0)
		return []Operation{rowOperation("messages", session, map[string]any{"messageId": message}, f, nil)}
	}
	return nil
}

var syncTypeNames = map[int]string{0: "INITIAL_BOOTSTRAP", 1: "INITIAL_STATUS_V3", 2: "FULL", 3: "RECENT", 4: "PUSH_NAME", 5: "NON_BLOCKING_DATA", 6: "ON_DEMAND"}

func HistorySyncTypeName(value any) string {
	if n, ok := number(value); ok {
		if s, ok := syncTypeNames[int(n)]; ok && float64(int(n)) == n {
			return s
		}
		s, _ := CanonicalJSON(n)
		return s
	}
	if s := text(value); s != "" {
		upper := strings.ToUpper(s)
		for _, name := range syncTypeNames {
			if upper == name {
				return upper
			}
		}
		return s
	}
	return "UNKNOWN"
}
func historyProgressOperations(session string, p map[string]any) []Operation {
	syncType := HistorySyncTypeName(p["syncType"])
	key := map[string]any{"syncType": syncType}
	ops := []Operation{}
	if order, ok := number(p["chunkOrder"]); ok {
		chunk := Fields{}
		for _, pair := range [][2]string{{"progress", "progress"}, {"conversationCount", "conversationCount"}, {"messageCount", "messageCount"}, {"pushnameCount", "pushNameCount"}} {
			if n, ok := number(p[pair[1]]); ok {
				put(chunk, pair[0], n, 0)
			}
		}
		orderText, _ := CanonicalJSON(order)
		ops = append(ops, rowOperation("history_chunks", session, map[string]any{"syncType": syncType, "chunkOrder": orderText}, chunk, nil))
	}
	progress := Fields{}
	if n, ok := number(p["progress"]); ok {
		put(progress, "progress", n, n)
	}
	if n, ok := number(p["chunkOrder"]); ok {
		put(progress, "lastChunkOrder", n, n)
	}
	return append(ops, rowOperation("history_progress", session, key, progress, nil))
}
