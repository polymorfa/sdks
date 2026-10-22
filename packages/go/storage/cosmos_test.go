package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/policy"
	"github.com/Azure/azure-sdk-for-go/sdk/data/azcosmos"
)

func TestCosmosNativeConformance(t *testing.T) {
	path := os.Getenv("POLYMORFA_COSMOS_FIXTURE_METADATA")
	if path == "" {
		t.Skip("Requires task-owned Cosmos emulator metadata")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var meta struct {
		SyntheticOnly bool   `json:"syntheticOnly"`
		Endpoint      string `json:"endpoint"`
		Key           string `json:"key"`
	}
	if json.Unmarshal(raw, &meta) != nil || !meta.SyntheticOnly {
		t.Fatal("synthetic Cosmos metadata required")
	}
	credential, err := azcosmos.NewKeyCredential(meta.Key)
	if err != nil {
		t.Fatal("fixture credential")
	}
	gate := &cosmosBatchGate{ready: make(chan struct{}), release: make(chan struct{})}
	client, err := azcosmos.NewClientWithKey(meta.Endpoint, credential, &azcosmos.ClientOptions{ClientOptions: azcore.ClientOptions{InsecureAllowCredentialWithHTTP: true, Transport: &http.Client{Timeout: 15 * time.Second, Transport: gate}, Retry: policy.RetryOptions{MaxRetries: -1}}})
	if err != nil {
		t.Fatal("Cosmos fixture client")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	name := fmt.Sprint("sdk-go-", time.Now().UnixNano())
	if _, err = client.CreateDatabase(ctx, azcosmos.DatabaseProperties{ID: name}, nil); err != nil {
		t.Fatal("create fixture database", safeCosmosDiagnostic(err))
	}
	db, err := client.NewDatabase(name)
	if err != nil {
		t.Fatal("fixture database client")
	}
	if _, err = db.CreateContainer(ctx, azcosmos.ContainerProperties{ID: "rows", PartitionKeyDefinition: azcosmos.PartitionKeyDefinition{Paths: []string{"/namespace"}}}, nil); err != nil {
		t.Fatal("create fixture container", safeCosmosDiagnostic(err))
	}
	container, err := db.NewContainer("rows")
	if err != nil {
		t.Fatal("fixture container client")
	}
	a, err := NewCosmosAdapter(ctx, container, ProviderOptions{Namespace: "native_go", Create: true})
	if err != nil {
		t.Fatal("Cosmos setup", err)
	}
	exerciseNativeProvider(t, a)
	// Force a stale physical ETag after the adapter's pre-reads but before its
	// native batch reaches Cosmos. The first insert must roll back when the later
	// conditional replace loses a race in that same atomic provider transaction.
	raced := newFixtureRow(t, "messages", "race", map[string]any{"messageId": "existing", "timestamp": 1})
	result, err := a.Commit(ctx, []Write{{Kind: "put", Entity: "messages", Row: raced}})
	if err != nil || !result.OK {
		t.Fatal("race seed", err)
	}
	wanted := cloneRow(raced)
	wanted["_rev"] = float64(2)
	absent := newFixtureRow(t, "messages", "race", map[string]any{"messageId": "absent", "timestamp": 1})
	revisionOne := int64(1)
	type outcome struct {
		result CommitResult
		err    error
	}
	done := make(chan outcome, 1)
	gate.armed.Store(true)
	go func() {
		r, e := a.Commit(ctx, []Write{{Kind: "put", Entity: "messages", Row: absent}, {Kind: "put", Entity: "messages", Row: wanted, ExpectedRev: &revisionOne}})
		done <- outcome{r, e}
	}()
	select {
	case <-gate.ready:
	case <-ctx.Done():
		t.Fatal("Cosmos batch was not dispatched")
	}
	current, err := a.read(ctx, "messages", raced["_id"].(string))
	if err != nil {
		close(gate.release)
		t.Fatal(err)
	}
	current.Row["_rev"] = float64(2)
	current.Row["text"] = "concurrent winner"
	current.ETag = ""
	changedRaw, _ := json.Marshal(current)
	if _, err = container.ReplaceItem(ctx, a.partition, current.ID, changedRaw, nil); err != nil {
		close(gate.release)
		t.Fatal("race winner", safeCosmosDiagnostic(err))
	}
	close(gate.release)
	lost := <-done
	if lost.err != nil || lost.result.OK || len(lost.result.Conflicts) == 0 {
		t.Fatal("stale ETag batch did not report conflict", lost.err)
	}
	remaining, err := a.Get(ctx, "messages", []string{absent["_id"].(string), raced["_id"].(string)})
	if err != nil || len(remaining) != 1 || remaining[raced["_id"].(string)]["text"] != "concurrent winner" {
		t.Fatal("native Cosmos batch partially committed", err)
	}

	foreign, err := NewCosmosAdapter(ctx, container, ProviderOptions{Namespace: "foreign_go", Create: true})
	if err != nil {
		t.Fatal(err)
	}
	id, _ := EncodeKey("messages", map[string]any{"sessionId": "rollback", "messageId": "a"})
	rows, err := foreign.Get(ctx, "messages", []string{id})
	if err != nil || len(rows) != 0 {
		t.Fatal("Cosmos namespace leaked", err)
	}
	limited, err := NewCosmosAdapter(ctx, container, ProviderOptions{Namespace: "native_go", MaxQueryRows: 1})
	if err != nil {
		t.Fatal(err)
	}
	assertProviderBound(t, limited)
	// The physical tombstone must retain its ETag; recreation uses logical absence
	// while still protecting against a concurrent recreate in the same partition.
	original := newFixtureRow(t, "messages", "tombstone", map[string]any{"messageId": "a", "timestamp": 1})
	result, err = a.Commit(ctx, []Write{{Kind: "put", Entity: "messages", Row: original}})
	if err != nil || !result.OK {
		t.Fatal("seed tombstone", err)
	}
	rev, _ := revision(original["_rev"])
	result, err = a.Commit(ctx, []Write{{Kind: "delete", Entity: "messages", ID: original["_id"].(string), ExpectedRev: &rev}})
	if err != nil || !result.OK {
		t.Fatal("conditional delete", err)
	}
	doc, err := a.read(ctx, "messages", original["_id"].(string))
	if err != nil || doc == nil || !doc.Deleted || doc.Row != nil || doc.ETag == "" {
		t.Fatal("missing conditional tombstone", err)
	}
	result, err = a.Commit(ctx, []Write{{Kind: "put", Entity: "messages", Row: original}})
	if err != nil || !result.OK {
		t.Fatal("recreate tombstone", err)
	}
	if err = a.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err = container.Read(ctx, nil); err != nil {
		t.Fatal("borrowed Cosmos container closed")
	}
	if _, err = NewCosmosAdapter(ctx, container, ProviderOptions{Namespace: "owned_go", OwnsClient: true}); err == nil {
		t.Fatal("unsupported Cosmos client ownership accepted")
	}
	// Partition verification is required even when no metadata exists yet.
	if _, err = db.CreateContainer(ctx, azcosmos.ContainerProperties{ID: "wrong", PartitionKeyDefinition: azcosmos.PartitionKeyDefinition{Paths: []string{"/entity"}}}, nil); err != nil {
		t.Fatal("wrong partition fixture")
	}
	wrong, _ := db.NewContainer("wrong")
	if _, err = NewCosmosAdapter(ctx, wrong, ProviderOptions{Namespace: "native_go", Create: true}); err == nil {
		t.Fatal("wrong partition accepted")
	}
	cancelled, stop := context.WithCancel(ctx)
	stop()
	if _, err = foreign.Get(cancelled, "messages", []string{id}); err == nil {
		t.Fatal("cancelled Cosmos read succeeded")
	}
	// Setup must never replace a customer's incompatible version marker.
	changed, _ := json.Marshal(cosmosDocument{ID: "storage_schema:storage", Namespace: "foreign_go", Entity: "storage_schema", Version: 3})
	if _, err = container.ReplaceItem(ctx, foreign.partition, "storage_schema:storage", changed, nil); err != nil {
		t.Fatal("version fixture")
	}
	if _, err = NewCosmosAdapter(ctx, container, ProviderOptions{Namespace: "foreign_go", Create: true}); err == nil {
		t.Fatal("Cosmos setup repinned schema")
	}
}
func safeCosmosDiagnostic(err error) any {
	// ResponseError.Error may include signed endpoint/query diagnostics. Tests only
	// report status codes and never echo credentials or the provider response body.
	if response, ok := err.(*azcore.ResponseError); ok {
		return response.StatusCode
	}
	return fmt.Sprintf("%T", err)
}

type cosmosBatchGate struct {
	armed          atomic.Bool
	ready, release chan struct{}
}

func (g *cosmosBatchGate) RoundTrip(r *http.Request) (*http.Response, error) {
	if r.Header.Get("x-ms-cosmos-is-batch-request") == "True" && g.armed.CompareAndSwap(true, false) {
		close(g.ready)
		select {
		case <-g.release:
		case <-r.Context().Done():
			return nil, r.Context().Err()
		}
	}
	return http.DefaultTransport.RoundTrip(r)
}
