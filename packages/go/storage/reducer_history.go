package storage

import (
	"encoding/base64"
	polymorfa "github.com/polymorfa/sdks/packages/go"
	"math"
	"strings"
)

type HistoryMessageIdentity struct {
	NativeID string
	ID       string
	ChatID   string
	FromMe   *bool
}
type HistoryIdentityIndex struct {
	Conversations map[string]string
	Contacts      map[string]string
	Messages      []HistoryMessageIdentity
}
type HistoryInput struct {
	SessionID  string
	Chunk      map[string]any
	ChunkID    *string
	Identities *HistoryIdentityIndex
}
type HistoryKeys struct {
	conversations, contacts map[string]string
	messages                map[string][]HistoryMessageIdentity
}

func NormalizeJID(jid string) string {
	user, domain, found := strings.Cut(jid, "@")
	if !found {
		return strings.ToLower(jid)
	}
	user = strings.Split(strings.Split(user, ":")[0], "_")[0]
	return strings.ToLower(user + "@" + domain)
}
func NewHistoryKeys(index *HistoryIdentityIndex, chunk map[string]any) *HistoryKeys {
	k := &HistoryKeys{map[string]string{}, map[string]string{}, map[string][]HistoryMessageIdentity{}}
	if index != nil {
		for jid, id := range index.Conversations {
			k.conversations[NormalizeJID(jid)] = id
		}
		for jid, id := range index.Contacts {
			k.contacts[NormalizeJID(jid)] = id
		}
		for _, m := range index.Messages {
			k.messages[m.NativeID] = append(k.messages[m.NativeID], m)
		}
	}
	for _, entry := range list(chunk["conversations"]) {
		c := object(entry)
		jid := text(c["id"])
		if jid == "" || k.conversations[NormalizeJID(jid)] != "" {
			continue
		}
		found := map[string]bool{}
		for _, entry := range list(c["messages"]) {
			key := object(object(object(entry)["message"])["key"])
			id := text(key["id"])
			own, has := key["fromMe"].(bool)
			for _, candidate := range k.messages[id] {
				if candidate.FromMe == nil || !has || *candidate.FromMe == own {
					found[candidate.ChatID] = true
				}
			}
		}
		if len(found) == 1 {
			for id := range found {
				k.conversations[NormalizeJID(jid)] = id
			}
		}
	}
	return k
}
func (k *HistoryKeys) ChatID(jid string) string {
	bare := NormalizeJID(jid)
	if id := k.conversations[bare]; id != "" {
		return id
	}
	return "wa:" + bare
}
func (k *HistoryKeys) ContactID(jid string) string {
	bare := NormalizeJID(jid)
	if id := k.contacts[bare]; id != "" {
		return id
	}
	if chatKind(bare, nil) == "direct" {
		if id := k.conversations[bare]; id != "" {
			return id
		}
	}
	return "wa:" + bare
}
func (k *HistoryKeys) MessageID(key map[string]any, chatJID string) string {
	native := text(key["id"])
	if native == "" {
		return ""
	}
	jid := NormalizeJID(text(first(nonempty(key["remoteJid"]), chatJID)))
	own := key["fromMe"] == true
	chat := k.ChatID(jid)
	candidates := []HistoryMessageIdentity{}
	for _, candidate := range k.messages[native] {
		if candidate.ChatID == chat && (candidate.FromMe == nil || *candidate.FromMe == own) {
			candidates = append(candidates, candidate)
		}
	}
	if len(candidates) == 1 {
		return candidates[0].ID
	}
	sender := ""
	if !own && chatKind(jid, nil) == "group" {
		sender = NormalizeJID(text(key["participant"]))
	}
	direction := "0"
	if own {
		direction = "1"
	}
	return "wa:" + jid + ":" + direction + ":" + sender + ":" + native
}
func HistoryIndexFromPayload(payload map[string]any) *HistoryIdentityIndex {
	index := &HistoryIdentityIndex{}
	for _, entry := range list(payload["messages"]) {
		m := object(entry)
		native, chat, id := text(object(m["whatsapp_ids"])["linked_devices"]), text(object(m["conversation"])["id"]), text(m["id"])
		if native == "" || chat == "" || id == "" {
			continue
		}
		identity := HistoryMessageIdentity{NativeID: native, ChatID: chat, ID: id}
		if b, ok := m["fromMe"].(bool); ok {
			identity.FromMe = &b
		}
		index.Messages = append(index.Messages, identity)
	}
	return index
}
func enumValue(value any, names map[string]int) (int, bool) {
	if n, ok := number(value); ok && math.Trunc(n) == n {
		return int(n), true
	}
	if s := text(value); s != "" {
		n, ok := names[strings.ToUpper(s)]
		return n, ok
	}
	return 0, false
}
func unwrap(content map[string]any) map[string]any {
	current := content
	for depth := 0; depth < 5; depth++ {
		var next map[string]any
		for _, name := range []string{"ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "documentWithCaptionMessage", "editedMessage"} {
			candidate, ok := object(current[name])["message"].(map[string]any)
			if ok {
				next = candidate
				break
			}
		}
		if next == nil {
			break
		}
		current = next
	}
	return current
}

type mappedContent struct {
	kind, quoted string
	fields       Fields
	mediaKind    string
	media        map[string]any
}

func mapHistoryContent(content map[string]any, version float64) *mappedContent {
	out := &mappedContent{fields: Fields{}}
	set := func(name string, v any) { put(out.fields, name, v, version) }
	if s := text(content["conversation"]); s != "" {
		out.kind = "text"
		set("text", s)
	} else if c, ok := content["extendedTextMessage"].(map[string]any); ok {
		out.kind = "text"
		set("text", nonempty(c["text"]))
		out.quoted = text(object(c["contextInfo"])["stanzaId"])
	} else {
		for _, pair := range [][2]string{{"imageMessage", "image"}, {"videoMessage", "video"}, {"ptvMessage", "video"}, {"audioMessage", "audio"}, {"documentMessage", "document"}, {"stickerMessage", "sticker"}} {
			if c, ok := content[pair[0]].(map[string]any); ok {
				out.kind = pair[1]
				out.mediaKind = pair[1]
				out.media = c
				set("caption", nonempty(c["caption"]))
				set("mimeType", nonempty(c["mimetype"]))
				set("fileName", nonempty(c["fileName"]))
				set("title", nonempty(c["title"]))
				var extra any
				if c["ptt"] == true {
					extra = map[string]any{"ptt": true}
				}
				set("extra", extra)
				out.quoted = text(object(c["contextInfo"])["stanzaId"])
				break
			}
		}
		if out.kind == "" {
			if c, ok := content["locationMessage"].(map[string]any); ok {
				out.kind = "location"
				set("latitude", c["degreesLatitude"])
				set("longitude", c["degreesLongitude"])
				set("title", nonempty(c["name"]))
				out.quoted = text(object(c["contextInfo"])["stanzaId"])
			} else if c, ok := content["contactMessage"].(map[string]any); ok {
				out.kind = "contact"
				set("displayName", nonempty(c["displayName"]))
			} else {
				var poll map[string]any
				for _, name := range []string{"pollCreationMessage", "pollCreationMessageV2", "pollCreationMessageV3"} {
					if p, ok := content[name].(map[string]any); ok {
						poll = p
						break
					}
				}
				if poll == nil {
					return nil
				}
				out.kind = "poll"
				set("title", nonempty(poll["name"]))
				options := []any{}
				for _, option := range list(poll["options"]) {
					if name := text(object(option)["optionName"]); name != "" {
						options = append(options, map[string]any{"name": name})
					}
				}
				set("pollOptions", options)
				out.quoted = text(object(poll["contextInfo"])["stanzaId"])
			}
		}
	}
	for _, field := range contentFields {
		if _, exists := out.fields[field]; !exists {
			set(field, nil)
		}
	}
	return out
}
func protoBase64(value any) any {
	switch v := value.(type) {
	case string:
		return nonempty(v)
	case []byte:
		if len(v) > 0 {
			return base64.StdEncoding.EncodeToString(v)
		}
	}
	return nil
}
func historyMediaWrites(media *mappedContent, chat string, version float64) Fields {
	m := media.media
	f := Fields{"chatId": {chat, 0}, "kind": {media.mediaKind, 0}}
	putIf(f, "mimeType", nonempty(m["mimetype"]), version)
	putIf(f, "fileName", nonempty(m["fileName"]), version)
	if n, ok := finite(m["fileLength"]); ok {
		put(f, "fileLength", n, version)
	}
	for _, field := range []string{"fileSha256", "fileEncSha256", "mediaKey"} {
		putIf(f, field, protoBase64(m[field]), version)
	}
	putIf(f, "directPath", nonempty(m["directPath"]), version)
	putIf(f, "mediaKeyTimestamp", valueMillis(m["mediaKeyTimestamp"]), version)
	return f
}

// ReduceWebMessageInfo consumes complete, application-decoded protocol JSON.
// The caller retains original protobuf bytes returned by the history codec.
func ReduceWebMessageInfo(info map[string]any, session string, keys *HistoryKeys, chatJID string) []Operation {
	key := object(info["key"])
	jid := text(first(nonempty(key["remoteJid"]), nonempty(chatJID)))
	if jid == "" {
		return nil
	}
	id := keys.MessageID(key, jid)
	if id == "" {
		return nil
	}
	chat := keys.ChatID(jid)
	own := key["fromMe"] == true
	group := chatKind(NormalizeJID(jid), nil) == "group"
	senderJID := ""
	senderID := SelfID
	if !own {
		senderJID = text(first(nonempty(key["participant"]), nonempty(info["participant"])))
		if senderJID == "" && !group {
			senderJID = jid
		}
		senderID = ""
		if senderJID != "" {
			senderID = keys.ContactID(senderJID)
		}
	}
	timestamp := ToMillis(info["messageTimestamp"])
	at := 0.0
	var guard *Watermark
	if timestamp != nil {
		at = *timestamp
		guard = &Watermark{session, chat, at}
	}
	content := unwrap(object(info["message"]))
	ops := []Operation{}
	if protocol, ok := content["protocolMessage"].(map[string]any); ok {
		target := keys.MessageID(object(protocol["key"]), jid)
		if target == "" {
			return nil
		}
		kind, valid := enumValue(protocol["type"], map[string]int{"REVOKE": 0, "MESSAGE_EDIT": 14})
		if !valid {
			return nil
		}
		if kind == 0 {
			f := cleared(contentFields)
			put(f, "chatId", chat, 0)
			put(f, "revokedAt", at, FinalVersion)
			return []Operation{rowOperation("messages", session, map[string]any{"messageId": target}, f, nil), rowOperation("media", session, map[string]any{"messageId": target}, cleared(mediaSecrets), nil)}
		}
		if kind == 14 {
			version := at
			if n := ToMillis(protocol["timestampMs"]); n != nil {
				version = *n
			}
			mapped := mapHistoryContent(unwrap(object(protocol["editedMessage"])), version)
			if mapped == nil {
				return nil
			}
			put(mapped.fields, "chatId", chat, 0)
			put(mapped.fields, "editedAt", version, version)
			return []Operation{rowOperation("messages", session, map[string]any{"messageId": target}, mapped.fields, guard)}
		}
		return nil
	}
	if reaction, ok := content["reactionMessage"].(map[string]any); ok {
		target := keys.MessageID(object(reaction["key"]), jid)
		if target == "" || senderID == "" {
			return nil
		}
		version := at
		if n := ToMillis(reaction["senderTimestampMs"]); n != nil {
			version = *n
		}
		f := Fields{"chatId": {chat, 0}, "emoji": {text(reaction["text"]), version}, "timestamp": {version, version}}
		return []Operation{rowOperation("reactions", session, map[string]any{"messageId": target, "senderId": senderID}, f, nil)}
	}
	fields := Fields{"chatId": {chat, 0}, "fromMe": {own, 0}, "timestamp": {at, 0}}
	putIf(fields, "senderId", nonempty(senderID), 0)
	if senderJID != "" {
		put(fields, "senderJid", NormalizeJID(senderJID), 0)
	}
	putIf(fields, "waMessageId", nonempty(key["id"]), 0)
	if !own {
		putIf(fields, "pushName", nonempty(info["pushName"]), 0)
	}
	if b, ok := info["starred"].(bool); ok {
		put(fields, "starred", b, 0)
	}
	if status, ok := enumValue(info["status"], map[string]int{"ERROR": 0, "PENDING": 1, "SERVER_ACK": 2, "DELIVERY_ACK": 3, "READ": 4, "PLAYED": 5}); own && ok {
		state := map[int]string{0: "failed", 1: "pending", 2: "sent", 3: "delivered", 4: "read", 5: "played"}[status]
		statusFields(fields, state, nil)
	}
	stub, _ := enumValue(info["messageStubType"], map[string]int{"REVOKE": 1})
	var media *mappedContent
	if stub == 1 {
		for k, v := range cleared(contentFields) {
			fields[k] = v
		}
		revoked := at
		if n := ToMillis(info["revokeMessageTimestamp"]); n != nil {
			revoked = *n
		}
		put(fields, "revokedAt", revoked, FinalVersion)
		ops = append(ops, rowOperation("media", session, map[string]any{"messageId": id}, cleared(mediaSecrets), nil))
	} else if len(content) > 0 {
		mapped := mapHistoryContent(content, 0)
		if mapped != nil {
			put(fields, "type", mapped.kind, 0)
			putIf(fields, "quotedId", nonempty(mapped.quoted), 0)
			for k, v := range mapped.fields {
				fields[k] = v
			}
			if mapped.media != nil {
				media = mapped
			}
		} else {
			put(fields, "type", "unknown", 0)
		}
	}
	ops = append(ops, rowOperation("messages", session, map[string]any{"messageId": id}, fields, guard))
	if media != nil {
		ops = append(ops, rowOperation("media", session, map[string]any{"messageId": id}, historyMediaWrites(media, chat, 0), guard))
	}
	for _, entry := range list(info["userReceipt"]) {
		r := object(entry)
		user := text(r["userJid"])
		if user == "" {
			continue
		}
		status := ""
		var receiptAt *float64
		for _, pair := range [][2]string{{"playedTimestamp", "played"}, {"readTimestamp", "read"}, {"receiptTimestamp", "delivered"}} {
			if n := ToMillis(r[pair[0]]); n != nil {
				status = pair[1]
				receiptAt = n
				break
			}
		}
		if receiptAt == nil {
			continue
		}
		f := Fields{"chatId": {chat, 0}}
		statusFields(f, status, receiptAt)
		f["timestamp"] = f["statusAt"]
		delete(f, "statusAt")
		ops = append(ops, rowOperation("receipts", session, map[string]any{"messageId": id, "recipientId": keys.ContactID(user)}, f, guard))
	}
	for _, entry := range list(info["reactions"]) {
		r := object(entry)
		k := object(r["key"])
		reactor := SelfID
		if k["fromMe"] != true {
			reactor = text(k["participant"])
			if reactor == "" && !group {
				reactor = jid
			}
			if reactor == "" {
				continue
			}
			reactor = keys.ContactID(reactor)
		}
		version := at
		if n := ToMillis(r["senderTimestampMs"]); n != nil {
			version = *n
		}
		f := Fields{"chatId": {chat, 0}, "emoji": {text(r["text"]), version}, "timestamp": {version, version}}
		ops = append(ops, rowOperation("reactions", session, map[string]any{"messageId": id, "senderId": reactor}, f, guard))
	}
	if !own && senderJID != "" && text(info["pushName"]) != "" && timestamp != nil {
		ops = append(ops, rowOperation("contacts", session, map[string]any{"contactId": keys.ContactID(senderJID)}, Fields{"jid": {NormalizeJID(senderJID), 0}, "pushName": {info["pushName"], *timestamp}}, nil))
	}
	return ops
}
func conversationOperations(session string, c map[string]any, keys *HistoryKeys) []Operation {
	jid := text(c["id"])
	if jid == "" {
		return nil
	}
	bare := NormalizeJID(jid)
	chat := keys.ChatID(bare)
	kind := chatKind(bare, nil)
	last := ToMillis(c["lastMsgTimestamp"])
	snapshot := 0.0
	if n := ToMillis(c["conversationTimestamp"]); n != nil {
		snapshot = *n
	}
	if last != nil {
		snapshot = max(snapshot, *last)
	}
	f := Fields{"jid": {bare, 0}}
	putIf(f, "kind", nonempty(kind), 0)
	putIf(f, "name", first(nonempty(c["name"]), nonempty(c["displayName"])), snapshot)
	putIf(f, "username", nonempty(c["username"]), snapshot)
	if kind == "direct" && text(c["pnJid"]) != "" {
		put(f, "phoneNumber", "+"+strings.Split(NormalizeJID(text(c["pnJid"])), "@")[0], snapshot)
	}
	for _, pair := range [][2]string{{"archived", "archived"}, {"markedUnread", "markedAsUnread"}, {"unreadCount", "unreadCount"}, {"readOnly", "readOnly"}, {"ephemeralExpiration", "ephemeralExpiration"}} {
		putIf(f, pair[0], c[pair[1]], snapshot)
	}
	if n, ok := finite(c["pinned"]); ok {
		put(f, "pinned", n > 0, snapshot)
	}
	if n, ok := finite(c["muteEndTime"]); ok {
		put(f, "muted", n != 0, snapshot)
		put(f, "muteEndAt", valueMillis(n), snapshot)
	}
	if last != nil {
		put(f, "lastMessageAt", *last, *last)
	}
	ops := []Operation{rowOperation("chats", session, map[string]any{"chatId": chat}, f, nil)}
	if kind == "group" {
		g := Fields{"jid": {bare, 0}}
		putIf(g, "subject", nonempty(c["name"]), snapshot)
		putIf(g, "description", nonempty(c["description"]), snapshot)
		putIf(g, "createdAt", valueMillis(c["createdAt"]), 0)
		if s := text(c["createdBy"]); s != "" {
			put(g, "createdBy", NormalizeJID(s), 0)
		}
		ops = append(ops, rowOperation("groups", session, map[string]any{"groupId": chat}, g, nil))
		for _, entry := range list(c["participant"]) {
			p := object(entry)
			user := text(p["userJid"])
			if user == "" {
				continue
			}
			rank, _ := enumValue(p["rank"], map[string]int{"REGULAR": 0, "ADMIN": 1, "SUPERADMIN": 2})
			role := map[int]string{0: "member", 1: "admin", 2: "superadmin"}[rank]
			if role == "" {
				role = "member"
			}
			m := Fields{"jid": {NormalizeJID(user), 0}, "role": {role, snapshot}, "active": {true, snapshot}, "changedAt": {snapshot, snapshot}}
			ops = append(ops, rowOperation("group_participants", session, map[string]any{"groupId": chat, "participantId": keys.ContactID(user)}, m, nil))
		}
	}
	for _, entry := range list(c["messages"]) {
		if info, ok := object(entry)["message"].(map[string]any); ok {
			ops = append(ops, ReduceWebMessageInfo(info, session, keys, bare)...)
		}
	}
	return ops
}
func ReduceHistoryChunk(input HistoryInput) (Batch, error) {
	if input.SessionID == "" || input.Chunk == nil {
		return Batch{}, invalid()
	}
	count := 0
	if validateJSON(input.Chunk, 0, &count) != nil {
		return Batch{}, invalid()
	}
	keys := NewHistoryKeys(input.Identities, input.Chunk)
	ops := []Operation{}
	messageCount := 0
	for _, entry := range list(input.Chunk["conversations"]) {
		c := object(entry)
		ops = append(ops, conversationOperations(input.SessionID, c, keys)...)
		messageCount += len(list(c["messages"]))
	}
	for _, entry := range list(input.Chunk["pushnames"]) {
		p := object(entry)
		jid, name := text(p["id"]), text(p["pushname"])
		if jid == "" || name == "" || chatKind(NormalizeJID(jid), nil) != "direct" {
			continue
		}
		f := Fields{"jid": {NormalizeJID(jid), 0}, "pushName": {name, 0}}
		ops = append(ops, rowOperation("contacts", input.SessionID, map[string]any{"contactId": keys.ContactID(jid)}, f, nil))
	}
	for _, entry := range list(input.Chunk["phoneNumberToLidMappings"]) {
		m := object(entry)
		pn, lid := text(m["pnJid"]), text(m["lidJid"])
		if pn == "" || lid == "" {
			continue
		}
		phone := "+" + strings.Split(NormalizeJID(pn), "@")[0]
		for _, jid := range []string{pn, lid} {
			f := Fields{"phoneNumber": {phone, 0}, "lidJid": {NormalizeJID(lid), 0}}
			ops = append(ops, rowOperation("contacts", input.SessionID, map[string]any{"contactId": keys.ContactID(jid)}, f, nil))
		}
	}
	for _, entry := range list(input.Chunk["pastParticipants"]) {
		p := object(entry)
		group := text(p["groupJid"])
		if group == "" {
			continue
		}
		for _, entry := range list(p["pastParticipants"]) {
			m := object(entry)
			user := text(m["userJid"])
			if user == "" {
				continue
			}
			left := 0.0
			if n := ToMillis(m["leaveTs"]); n != nil {
				left = *n
			}
			reason, _ := enumValue(m["leaveReason"], map[string]int{"LEFT": 0, "REMOVED": 1})
			why := "left"
			if reason == 1 {
				why = "removed"
			}
			f := Fields{"jid": {NormalizeJID(user), 0}, "active": {false, left}, "leaveReason": {why, left}, "changedAt": {left, left}}
			ops = append(ops, rowOperation("group_participants", input.SessionID, map[string]any{"groupId": keys.ChatID(group), "participantId": keys.ContactID(user)}, f, nil))
		}
	}
	progress := map[string]any{"syncType": input.Chunk["syncType"], "conversationCount": len(list(input.Chunk["conversations"])), "messageCount": messageCount, "pushNameCount": len(list(input.Chunk["pushnames"]))}
	for _, f := range []string{"chunkOrder", "progress"} {
		if n, ok := finite(input.Chunk[f]); ok {
			progress[f] = n
		}
	}
	ops = append(ops, historyProgressOperations(input.SessionID, progress)...)
	batch := Batch{SessionID: input.SessionID, EventType: strValue("history.chunk"), Operations: ops}
	if input.ChunkID != nil {
		batch.EventID = strValue("history:" + *input.ChunkID)
	}
	return batch, nil
}
func strValue(s string) *string { return &s }

// ReduceHistoryData requires an explicit complete-schema decoder result. The
// codec's minimal core view is not silently treated as a fully decoded chunk.
func ReduceHistoryData(session string, data *polymorfa.HistorySyncData, chunkID *string, index *HistoryIdentityIndex) (Batch, error) {
	if data == nil || data.Decoded == nil {
		return Batch{}, storageError("complete_history_decoder_required")
	}
	chunk, ok := jsonValue(data.Decoded).(map[string]any)
	if !ok {
		return Batch{}, storageError("complete_history_decoder_required")
	}
	return ReduceHistoryChunk(HistoryInput{session, chunk, chunkID, index})
}
