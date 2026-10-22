package storage

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"
)

func TestSupabaseRequiresDistinctWriterAndSafeNames(t *testing.T) {
	for _, o := range []SupabaseOptions{{ServerRole: "authenticated"}, {ServerRole: "anon"}, {ServerRole: "same", ReaderRole: "same"}, {Schema: "unsafe;sql"}, {TablePrefix: "unsafe;sql"}} {
		if _, err := SupabaseSchema(o); err == nil {
			t.Fatal("unsafe Supabase authority")
		}
	}
}
func TestSupabaseNativeForceRLSServerWriterAndLiveReader(t *testing.T) {
	path := os.Getenv("POLYMORFA_SQL_FIXTURE_METADATA")
	if path == "" {
		t.Skip("Requires task-owned PostgreSQL fixture metadata")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var meta map[string]string
	if json.Unmarshal(raw, &meta) != nil {
		t.Fatal("fixture metadata")
	}
	admin, err := sql.Open("pgx", meta["postgres"])
	if err != nil {
		t.Fatal("open admin fixture")
	}
	defer admin.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	nonce := fmt.Sprint(time.Now().UnixNano())
	database := "sdk_rls_" + nonce
	writer, reader := "sdk_writer_"+nonce, "sdk_reader_"+nonce
	if _, err = admin.ExecContext(ctx, "CREATE DATABASE "+sqlQuote(PostgreSQL, database)); err != nil {
		t.Fatal("create isolated fixture database")
	}
	base, err := url.Parse(meta["postgres"])
	if err != nil {
		t.Fatal("parse fixture URL")
	}
	base.Path = "/" + database
	owner, err := sql.Open("pgx", base.String())
	if err != nil {
		t.Fatal("open isolated database")
	}
	defer owner.Close()
	secret := make([]byte, 24)
	if _, err = rand.Read(secret); err != nil {
		t.Fatal(err)
	}
	password := hex.EncodeToString(secret)
	for _, role := range []string{writer, reader} {
		if _, err = owner.ExecContext(ctx, "CREATE ROLE "+sqlQuote(PostgreSQL, role)+" LOGIN NOBYPASSRLS PASSWORD '"+password+"'"); err != nil {
			t.Fatal("create restricted fixture role")
		}
	}
	if _, err = owner.ExecContext(ctx, `CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO PUBLIC;`); err != nil {
		t.Fatal("install synthetic auth UID fixture")
	}
	settings := SupabaseOptions{Schema: "customer", TablePrefix: "customer_", ServerRole: writer, ReaderRole: reader}
	script, err := SupabaseSchema(settings)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = owner.ExecContext(ctx, script); err != nil {
		t.Fatal("install customer Supabase/RLS preset", err)
	}
	var forced int
	if err = owner.QueryRowContext(ctx, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='customer' AND c.relkind='r' AND c.relforcerowsecurity").Scan(&forced); err != nil || forced != len(sqlEntities())+1 {
		t.Fatal("FORCE RLS missing", forced, err)
	}
	writerURL := *base
	writerURL.User = url.UserPassword(writer, password)
	writerDB, err := sql.Open("pgx", writerURL.String())
	if err != nil {
		t.Fatal("writer login")
	}
	defer writerDB.Close()
	create := false
	adapter, err := NewSQLAdapter(ctx, writerDB, PostgreSQL, SQLOptions{Schema: "customer", TablePrefix: "customer_", CreateTables: &create})
	if err != nil {
		t.Fatal("restricted writer schema verification/metadata SELECT", err)
	}
	e := engineFor(t, adapter, EngineOptions{})
	for _, session := range []string{"session_a", "session_b"} {
		if _, err = e.Apply(ctx, Batch{SessionID: session, Operations: []Operation{upsert("messages", session, map[string]any{"messageId": "m"}, map[string]any{"chatId": "chat", "text": "synthetic private fixture", "timestamp": 100}, 0)}}); err != nil {
			t.Fatal("restricted writer transaction", err)
		}
	}
	uid := "00000000-0000-0000-0000-000000000001"
	if _, err = owner.ExecContext(ctx, `INSERT INTO customer.customer_storage_memberships(session_id,subject) VALUES ('session_a',$1::uuid)`, uid); err != nil {
		t.Fatal(err)
	}
	readerURL := *base
	readerURL.User = url.UserPassword(reader, password)
	readerDB, err := sql.Open("pgx", readerURL.String())
	if err != nil {
		t.Fatal("reader login")
	}
	defer readerDB.Close()
	connection, err := readerDB.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	if _, err = connection.ExecContext(ctx, "SELECT set_config('request.jwt.claim.sub',$1,false)", uid); err != nil {
		t.Fatal(err)
	}
	var count int
	if err = connection.QueryRowContext(ctx, "SELECT count(*) FROM customer.customer_messages").Scan(&count); err != nil || count != 1 {
		t.Fatal("reader crossed membership", count, err)
	}
	if _, err = connection.ExecContext(ctx, "DELETE FROM customer.customer_messages"); err == nil {
		t.Fatal("browser write granted")
	}
	if _, err = connection.ExecContext(ctx, `INSERT INTO customer.customer_storage_memberships(session_id,subject) VALUES('session_b',$1::uuid)`, uid); err == nil {
		t.Fatal("browser membership management granted")
	}
	if _, err = owner.ExecContext(ctx, "DELETE FROM customer.customer_storage_memberships WHERE subject=$1::uuid", uid); err != nil {
		t.Fatal(err)
	}
	if err = connection.QueryRowContext(ctx, "SELECT count(*) FROM customer.customer_messages").Scan(&count); err != nil || count != 0 {
		t.Fatal("membership revocation cached", count, err)
	}
}
