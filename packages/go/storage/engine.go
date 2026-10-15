package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"math"
	"time"
)

// Operation follows the shared schema2 reducer wire contract. ExpectedCursor is
// nil when unspecified; a nonnil wrapper with Value nil explicitly requires no cursor.
type Operation struct {
	Kind           string          `json:"kind"`
	Entity         string          `json:"entity,omitempty"`
	Key            map[string]any  `json:"key,omitempty"`
	Fields         Fields          `json:"fields,omitempty"`
	Guard          *Watermark      `json:"guard,omitempty"`
	SessionID      string          `json:"sessionId,omitempty"`
	ChatID         string          `json:"chatId,omitempty"`
	UpTo           float64         `json:"upTo,omitempty"`
	Stream         string          `json:"stream,omitempty"`
	Cursor         string          `json:"cursor,omitempty"`
	ExpectedCursor *ExpectedCursor `json:"expectedCursor,omitempty"`
	Position       any             `json:"position,omitempty"`
	UpdatedAt      *float64        `json:"updatedAt,omitempty"`
}
type ExpectedCursor struct{ Value *string }
type Watermark struct {
	SessionID string  `json:"sessionId"`
	ChatID    string  `json:"chatId"`
	Timestamp float64 `json:"timestamp"`
}
type Batch struct {
	SessionID  string      `json:"sessionId"`
	EventID    *string     `json:"eventId,omitempty"`
	EventType  *string     `json:"eventType,omitempty"`
	Operations []Operation `json:"operations"`
}
type ApplyResult struct {
	Applied bool
	Writes  int
}
type QueryPage struct {
	Rows []Row
	Next *Cursor
}
type SavedCheckpoint struct {
	Cursor    string
	Position  any
	UpdatedAt *float64
}
type EngineOptions struct {
	MaxRetries    *int
	ClearPageSize int
	LeaseDuration time.Duration
	LeaseWait     *time.Duration
	Now           func() time.Time
}
type Engine struct {
	adapter             Adapter
	retries, size, page int
	duration, wait      time.Duration
	now                 func() time.Time
}
type lease struct {
	row  Row
	lost bool
}

func NewEngine(adapter Adapter, options EngineOptions) (*Engine, error) {
	if adapter == nil {
		return nil, invalid()
	}
	caps := adapter.Capabilities()
	if !caps.AtomicCommit || caps.MaxCommitSize < 2 {
		return nil, invalid()
	}
	retries := 8
	if options.MaxRetries != nil {
		retries = *options.MaxRetries
	}
	page := options.ClearPageSize
	if page == 0 {
		page = 200
	}
	duration := options.LeaseDuration
	if duration == 0 {
		duration = 30 * time.Second
	}
	wait := 30 * time.Second
	if options.LeaseWait != nil {
		wait = *options.LeaseWait
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	if retries < 0 || retries > 100 || page < 1 || page > 10000 || duration <= 0 || wait < 0 {
		return nil, invalid()
	}
	return &Engine{adapter, retries, caps.MaxCommitSize - 1, page, duration, wait, now}, nil
}
func (e *Engine) Adapter() Adapter   { return e.adapter }
func storageError(code string) error { return &Error{code} }
func (e *Engine) millis() float64    { return float64(e.now().UnixMilli()) }
func pause(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
func (e *Engine) read(ctx context.Context, entity string, ids []string, leases ...*lease) (map[string]Row, error) {
	out := map[string]Row{}
	for start := 0; start < len(ids); start += 500 {
		if len(leases) > 0 {
			if err := e.renewIfNeeded(ctx, leases[0]); err != nil {
				return nil, err
			}
		}
		end := min(start+500, len(ids))
		rows, err := e.adapter.Get(ctx, entity, ids[start:end])
		if err != nil {
			return nil, err
		}
		allowed := map[string]bool{}
		for _, id := range ids[start:end] {
			allowed[id] = true
		}
		for id, row := range rows {
			if !allowed[id] || row["_id"] != id || ValidateRow(entity, row) != nil {
				return nil, invalid()
			}
			out[id] = cloneRow(row)
		}
	}
	return out, nil
}
func (e *Engine) acquire(ctx context.Context, session string) (*lease, error) {
	id, err := EncodeKey("leases", map[string]any{"sessionId": session})
	if err != nil {
		return nil, err
	}
	random := make([]byte, 16)
	if _, err = rand.Read(random); err != nil {
		return nil, storageError("lease_entropy_unavailable")
	}
	owner := hex.EncodeToString(random)
	deadline := time.Now().Add(e.wait)
	for {
		rows, err := e.read(ctx, "leases", []string{id})
		if err != nil {
			return nil, err
		}
		before := rows[id]
		expires, _ := number(before["expiresAt"])
		if before == nil || before["owner"] == nil || before["owner"] == "" || expires <= e.millis() {
			row := cloneRow(before)
			if row == nil {
				row, err = EmptyRow("leases", map[string]any{"sessionId": session})
				if err != nil {
					return nil, err
				}
			}
			rev, _ := number(row["_rev"])
			if rev >= FinalVersion {
				return nil, storageError("lease_generation_exhausted")
			}
			row["owner"] = owner
			row["expiresAt"] = e.millis() + float64(e.duration)/float64(time.Millisecond)
			row["_rev"] = rev + 1
			var expected *int64
			if before != nil {
				v, _ := revision(before["_rev"])
				expected = &v
			}
			result, err := e.adapter.Commit(ctx, []Write{{Kind: "put", Entity: "leases", Row: row, ExpectedRev: expected}})
			if err != nil {
				return nil, err
			}
			if result.OK {
				return &lease{row: row}, nil
			}
		}
		if !time.Now().Before(deadline) {
			return nil, storageError("storage_lease_lost")
		}
		if err := pause(ctx, 5*time.Millisecond); err != nil {
			return nil, err
		}
	}
}
func (e *Engine) fenced(ctx context.Context, l *lease, writes []Write) (CommitResult, error) {
	expires, _ := number(l.row["expiresAt"])
	rev, ok := revision(l.row["_rev"])
	if l.lost || !ok || expires <= e.millis() || float64(rev) >= FinalVersion {
		return CommitResult{}, storageError("storage_lease_lost")
	}
	next := cloneRow(l.row)
	next["_rev"] = rev + 1
	next["expiresAt"] = e.millis() + float64(e.duration)/float64(time.Millisecond)
	fenced := append(append([]Write{}, writes...), Write{Kind: "put", Entity: "leases", Row: next, ExpectedRev: &rev})
	result, err := e.adapter.Commit(ctx, fenced)
	if err != nil {
		return CommitResult{}, err
	}
	if result.OK {
		l.row = next
		return result, nil
	}
	// A failed status, even without conflict IDs, must never become success.
	rows, err := e.read(ctx, "leases", []string{l.row["_id"].(string)})
	if err != nil {
		return CommitResult{}, err
	}
	live := rows[l.row["_id"].(string)]
	liveRev, _ := revision(live["_rev"])
	if live == nil || liveRev != rev || live["owner"] != l.row["owner"] {
		l.lost = true
		return CommitResult{}, storageError("storage_lease_lost")
	}
	return result, nil
}

// Renew between bounded planning operations. An expired or replaced lease is
// never extended: the same conditional fence used for data commits owns renewal.
func (e *Engine) renewIfNeeded(ctx context.Context, l *lease) error {
	expires, ok := number(l.row["expiresAt"])
	if l.lost || !ok || expires <= e.millis() {
		return storageError("storage_lease_lost")
	}
	if expires-e.millis() > float64(e.duration)/float64(time.Millisecond)/2 {
		return nil
	}
	result, err := e.fenced(ctx, l, nil)
	if err != nil {
		return err
	}
	if !result.OK {
		return storageError("storage_conflict")
	}
	return nil
}
func (e *Engine) release(ctx context.Context, l *lease) {
	if l.lost {
		return
	}
	rev, ok := revision(l.row["_rev"])
	if !ok || float64(rev) >= FinalVersion {
		return
	}
	row := cloneRow(l.row)
	row["_rev"] = rev + 1
	row["owner"] = nil
	row["expiresAt"] = 0
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Second)
	defer cancel()
	e.adapter.Commit(ctx, []Write{{Kind: "put", Entity: "leases", Row: row, ExpectedRev: &rev}})
}
func operationIdentity(op Operation) (string, string, error) {
	entity, key := op.Entity, op.Key
	if op.Kind == "checkpoint" {
		entity = "checkpoints"
		key = map[string]any{"sessionId": op.SessionID, "stream": op.Stream}
	}
	id, err := EncodeKey(entity, key)
	return entity, id, err
}
func validateOperation(op Operation, session string) error {
	actual := op.Key["sessionId"]
	if op.Kind == "clearChat" || op.Kind == "checkpoint" {
		actual = op.SessionID
	}
	if actual != session {
		return invalid()
	}
	if op.Guard != nil && (op.Kind != "upsert" && op.Kind != "patch" || op.Guard.SessionID != session || op.Guard.ChatID == "" || math.IsNaN(op.Guard.Timestamp) || math.IsInf(op.Guard.Timestamp, 0)) {
		return invalid()
	}
	switch op.Kind {
	case "clearChat":
		if op.ChatID == "" || math.IsNaN(op.UpTo) || math.IsInf(op.UpTo, 0) {
			return invalid()
		}
		return nil
	case "checkpoint":
		if op.Cursor == "" {
			return invalid()
		}
		_, err := EncodeKey("checkpoints", map[string]any{"sessionId": session, "stream": op.Stream})
		if err != nil {
			return err
		}
		count := 0
		if validateJSON(op.Position, 0, &count) != nil {
			return invalid()
		}
		if op.UpdatedAt != nil && (math.IsNaN(*op.UpdatedAt) || math.IsInf(*op.UpdatedAt, 0)) {
			return invalid()
		}
		return nil
	case "upsert", "patch", "delete":
		if op.Entity == "leases" {
			return invalid()
		}
		row, err := EmptyRow(op.Entity, op.Key)
		if err != nil {
			return err
		}
		if op.Kind != "delete" {
			_, _, err = MergeFields(op.Entity, row, op.Fields)
		}
		return err
	default:
		return invalid()
	}
}
func (e *Engine) plan(ctx context.Context, ops []Operation, l *lease) ([]Write, error) {
	type slot struct{ entity, id string }
	order := []slot{}
	original := map[slot]Row{}
	stored := map[slot]Row{}
	byEntity := map[string][]string{}
	for _, op := range ops {
		entity, id, err := operationIdentity(op)
		if err != nil {
			return nil, err
		}
		s := slot{entity, id}
		if _, exists := original[s]; !exists {
			original[s] = nil
			order = append(order, s)
			byEntity[entity] = append(byEntity[entity], id)
		}
	}
	for entity, ids := range byEntity {
		rows, err := e.read(ctx, entity, ids, l)
		if err != nil {
			return nil, err
		}
		for _, id := range ids {
			s := slot{entity, id}
			original[s] = rows[id]
			stored[s] = cloneRow(rows[id])
		}
	}
	for _, op := range ops {
		entity, id, _ := operationIdentity(op)
		s := slot{entity, id}
		current := stored[s]
		switch op.Kind {
		case "delete":
			stored[s] = nil
		case "checkpoint":
			var live *string
			if current != nil && current["cursor"] != nil {
				v, ok := current["cursor"].(string)
				if !ok {
					return nil, invalid()
				}
				live = &v
			}
			if op.ExpectedCursor != nil {
				want := op.ExpectedCursor.Value
				if live == nil && want != nil || live != nil && want == nil || live != nil && want != nil && *live != *want {
					return nil, storageError("storage_checkpoint_conflict")
				}
			}
			base := current
			if base == nil {
				base, _ = EmptyRow(entity, map[string]any{"sessionId": op.SessionID, "stream": op.Stream})
			}
			base = cloneRow(base)
			base["cursor"] = op.Cursor
			base["position"] = op.Position
			base["updatedAt"] = nil
			if op.UpdatedAt != nil {
				base["updatedAt"] = *op.UpdatedAt
			}
			stored[s] = base
		case "upsert", "patch":
			if current == nil && op.Kind == "patch" {
				continue
			}
			base := current
			if base == nil {
				base, _ = EmptyRow(entity, op.Key)
			}
			next, _, err := MergeFields(entity, base, op.Fields)
			if err != nil {
				return nil, err
			}
			stored[s] = next
		}
	}
	writes := []Write{}
	for _, s := range order {
		before, next := original[s], stored[s]
		var expected *int64
		rev := int64(0)
		if before != nil {
			rev, _ = revision(before["_rev"])
			expected = &rev
		}
		if next == nil {
			if before != nil {
				writes = append(writes, Write{Kind: "delete", Entity: s.entity, ID: s.id, ExpectedRev: expected})
			}
			continue
		}
		same := false
		if before != nil {
			left, _ := CanonicalJSON(before)
			right, _ := CanonicalJSON(next)
			same = left == right
		}
		if same {
			continue
		}
		if float64(rev) >= FinalVersion {
			return nil, invalid()
		}
		next = cloneRow(next)
		next["_rev"] = rev + 1
		writes = append(writes, Write{Kind: "put", Entity: s.entity, Row: next, ExpectedRev: expected})
	}
	return writes, nil
}
func (e *Engine) applyRows(ctx context.Context, ops []Operation, extra []Write, l *lease) (int, error) {
	total := 0
	groupSize := max(e.size, 500)
	for offset := 0; ; offset += groupSize {
		end := min(offset+groupSize, len(ops))
		group := ops[offset:end]
		last := end >= len(ops)
		additional := []Write{}
		if last {
			additional = extra
		}
		success := false
		for attempt := 0; attempt <= e.retries; attempt++ {
			writes, err := e.plan(ctx, group, l)
			if err != nil {
				return total, err
			}
			writes = append(writes, additional...)
			if len(writes) == 0 {
				success = true
				break
			}
			failed := false
			for start := 0; start < len(writes); start += e.size {
				result, err := e.fenced(ctx, l, writes[start:min(start+e.size, len(writes))])
				if err != nil {
					return total, err
				}
				if !result.OK {
					failed = true
					break
				}
				total += min(e.size, len(writes)-start)
			}
			if !failed {
				success = true
				break
			}
			if attempt < e.retries {
				if err := pause(ctx, time.Duration(min(200, 5*(1<<min(attempt, 6))))*time.Millisecond); err != nil {
					return total, err
				}
			}
		}
		if !success {
			return total, storageError("storage_conflict")
		}
		if last {
			return total, nil
		}
	}
}
func (e *Engine) clearChat(ctx context.Context, op Operation, l *lease) (int, error) {
	total := 0
	for {
		if err := e.renewIfNeeded(ctx, l); err != nil {
			return total, err
		}
		messages, err := e.adapter.Query(ctx, "messages", Query{Index: "by_chat", Equals: map[string]string{"sessionId": op.SessionID, "chatId": op.ChatID}, Range: map[string]float64{"lte": op.UpTo}, Order: "asc", Limit: e.page})
		if err != nil {
			return total, err
		}
		if len(messages) == 0 {
			return total, nil
		}
		deletes := []Operation{}
		for _, message := range messages {
			if ValidateRow("messages", message) != nil || message["sessionId"] != op.SessionID || message["chatId"] != op.ChatID {
				return total, invalid()
			}
			messageID, ok := message["messageId"].(string)
			if !ok {
				return total, invalid()
			}
			key := map[string]any{"sessionId": op.SessionID, "messageId": messageID}
			deletes = append(deletes, Operation{Kind: "delete", Entity: "media", Key: key})
			for _, entity := range []string{"reactions", "receipts", "poll_votes"} {
				for {
					if err := e.renewIfNeeded(ctx, l); err != nil {
						return total, err
					}
					children, err := e.adapter.Query(ctx, entity, Query{Index: "by_message", Equals: map[string]string{"sessionId": op.SessionID, "messageId": messageID}, Order: "asc", Limit: 500})
					if err != nil {
						return total, err
					}
					if len(children) == 0 {
						break
					}
					writes := []Write{}
					for _, child := range children {
						if ValidateRow(entity, child) != nil || child["sessionId"] != op.SessionID || child["messageId"] != messageID {
							return total, invalid()
						}
						rev, _ := revision(child["_rev"])
						writes = append(writes, Write{Kind: "delete", Entity: entity, ID: child["_id"].(string), ExpectedRev: &rev})
					}
					for start := 0; start < len(writes); start += e.size {
						result, err := e.fenced(ctx, l, writes[start:min(start+e.size, len(writes))])
						if err != nil {
							return total, err
						}
						if !result.OK {
							return total, storageError("storage_conflict")
						}
					}
					total += len(children)
					if len(children) < 500 {
						break
					}
				}
			}
			deletes = append(deletes, Operation{Kind: "delete", Entity: "messages", Key: key})
		}
		count, err := e.applyRows(ctx, deletes, nil, l)
		total += count
		if err != nil {
			return total, err
		}
	}
}
func (e *Engine) Apply(ctx context.Context, batch Batch) (ApplyResult, error) {
	if batch.SessionID == "" {
		return ApplyResult{}, invalid()
	}
	for _, op := range batch.Operations {
		if err := validateOperation(op, batch.SessionID); err != nil {
			return ApplyResult{}, err
		}
	}
	if batch.EventID != nil && *batch.EventID == "" {
		return ApplyResult{}, invalid()
	}
	l, err := e.acquire(ctx, batch.SessionID)
	if err != nil {
		return ApplyResult{}, err
	}
	defer e.release(ctx, l)
	marker := []Write{}
	if batch.EventID != nil {
		row, err := EmptyRow("events", map[string]any{"sessionId": batch.SessionID, "eventId": *batch.EventID})
		if err != nil {
			return ApplyResult{}, err
		}
		existing, err := e.read(ctx, "events", []string{row["_id"].(string)}, l)
		if err != nil {
			return ApplyResult{}, err
		}
		if len(existing) > 0 {
			return ApplyResult{}, nil
		}
		row["_rev"] = 1
		if batch.EventType != nil {
			row["type"] = *batch.EventType
		}
		marker = append(marker, Write{Kind: "put", Entity: "events", Row: row})
	}
	plain, guarded, clears := []Operation{}, []Operation{}, []Operation{}
	for _, op := range batch.Operations {
		if op.Kind == "clearChat" {
			clears = append(clears, op)
		} else if op.Guard != nil {
			guarded = append(guarded, op)
		} else {
			plain = append(plain, op)
		}
	}
	total, err := e.applyRows(ctx, plain, nil, l)
	if err != nil {
		return ApplyResult{}, err
	}
	for _, op := range clears {
		count, err := e.clearChat(ctx, op, l)
		if err != nil {
			return ApplyResult{}, err
		}
		total += count
	}
	kept := []Operation{}
	for _, op := range guarded {
		g := op.Guard
		id, err := EncodeKey("chats", map[string]any{"sessionId": g.SessionID, "chatId": g.ChatID})
		if err != nil {
			return ApplyResult{}, err
		}
		chats, err := e.read(ctx, "chats", []string{id}, l)
		if err != nil {
			return ApplyResult{}, err
		}
		mark := math.Inf(-1)
		for _, field := range []string{"clearedAt", "deletedAt"} {
			if n, ok := number(chats[id][field]); ok {
				mark = max(mark, n)
			}
		}
		if g.Timestamp > mark {
			kept = append(kept, op)
		}
	}
	count, err := e.applyRows(ctx, kept, marker, l)
	if err != nil {
		return ApplyResult{}, err
	}
	return ApplyResult{true, total + count}, nil
}
func (e *Engine) Get(ctx context.Context, entity string, key map[string]any) (Row, error) {
	id, err := EncodeKey(entity, key)
	if err != nil {
		return nil, err
	}
	rows, err := e.read(ctx, entity, []string{id})
	if err != nil {
		return nil, err
	}
	if rows[id] == nil {
		return nil, nil
	}
	return PublicRow(entity, rows[id])
}
func (e *Engine) Query(ctx context.Context, entity string, q Query) (QueryPage, error) {
	idx, err := validateQuery(entity, q, 10000)
	if err != nil {
		return QueryPage{}, err
	}
	rows, err := e.adapter.Query(ctx, entity, q)
	if err != nil {
		return QueryPage{}, err
	}
	out := QueryPage{Rows: []Row{}}
	for _, row := range rows {
		if ValidateRow(entity, row) != nil {
			return QueryPage{}, invalid()
		}
		public, err := PublicRow(entity, row)
		if err != nil {
			return QueryPage{}, err
		}
		out.Rows = append(out.Rows, public)
	}
	if len(rows) > 0 && len(rows) >= q.Limit {
		last := rows[len(rows)-1]
		n, _ := number(last[idx.Sort])
		out.Next = &Cursor{Sort: n, ID: last["_id"].(string)}
	}
	return out, nil
}
func (e *Engine) GetCheckpoint(ctx context.Context, session, stream string) (*SavedCheckpoint, error) {
	row, err := e.Get(ctx, "checkpoints", map[string]any{"sessionId": session, "stream": stream})
	if err != nil || row == nil {
		return nil, err
	}
	cursor, ok := row["cursor"].(string)
	if !ok {
		return nil, nil
	}
	result := &SavedCheckpoint{Cursor: cursor, Position: row["position"]}
	if n, ok := number(row["updatedAt"]); ok {
		result.UpdatedAt = &n
	}
	return result, nil
}
func (e *Engine) HasEvent(ctx context.Context, session, event string) (bool, error) {
	row, err := e.Get(ctx, "events", map[string]any{"sessionId": session, "eventId": event})
	return row != nil, err
}

func (v ExpectedCursor) MarshalJSON() ([]byte, error) { return json.Marshal(v.Value) }
func (op *Operation) UnmarshalJSON(raw []byte) error {
	type plain Operation
	var decoded plain
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil {
		return invalid()
	}
	delete(fields, "expectedCursor")
	base, err := json.Marshal(fields)
	if err != nil {
		return invalid()
	}
	if json.Unmarshal(base, &decoded) != nil {
		return invalid()
	}
	var all map[string]json.RawMessage
	json.Unmarshal(raw, &all)
	if expected, ok := all["expectedCursor"]; ok {
		var value *string
		if json.Unmarshal(expected, &value) != nil {
			return invalid()
		}
		decoded.ExpectedCursor = &ExpectedCursor{Value: value}
	}
	*op = Operation(decoded)
	return nil
}
func (*Engine) String() string               { return "StorageEngine[redacted]" }
func (e *Engine) GoString() string           { return e.String() }
func (*Engine) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }
