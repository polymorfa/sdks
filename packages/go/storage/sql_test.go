package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	_ "github.com/jackc/pgx/v5/stdlib"
	_ "github.com/tursodatabase/libsql-client-go/libsql"
	_ "modernc.org/sqlite"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func sqliteDB(t *testing.T) *sql.DB {
	t.Helper()
	root := os.Getenv("POLYMORFA_STORAGE_TEST_DIR")
	if root == "" {
		cache, err := os.UserCacheDir()
		if err != nil {
			t.Fatal(err)
		}
		root = filepath.Join(cache, "polymorfa-sdk", "storage-tests")
	}
	if err := os.MkdirAll(root, 0700); err != nil {
		t.Fatal(err)
	}
	dir, err := os.MkdirTemp(root, "sqlite-")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, "storage.db")+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}
func sqlAdapterFor(t *testing.T, dialect SQLDialect, db *sql.DB) *SQLAdapter {
	t.Helper()
	prefix := fmt.Sprintf("go_%d_", time.Now().UnixNano()%1000000000000)
	a, err := NewSQLAdapter(context.Background(), db, dialect, SQLOptions{TablePrefix: prefix})
	if err != nil {
		t.Fatal(dialect, err)
	}
	return a
}
func exerciseSQLAdapter(t *testing.T, a *SQLAdapter) {
	t.Helper()
	ctx := context.Background()
	if !a.Capabilities().AtomicCommit {
		t.Fatal("unverified atomicity")
	}
	events, eventRows, history, historyRows := portable(t)
	e := engineFor(t, a, EngineOptions{})
	for _, event := range events {
		batch, err := ReduceEvent(event)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := e.Apply(ctx, batch); err != nil {
			t.Fatal(event.Event, err)
		}
	}
	assertFixtureRows(t, e, eventRows)
	batch, err := ReduceHistoryChunk(HistoryInput{SessionID: "native-sql-history", Chunk: history, ChunkID: str("history")})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = e.Apply(ctx, batch); err != nil {
		t.Fatal(err)
	}
	for _, rows := range historyRows {
		for _, row := range rows {
			row["sessionId"] = "native-sql-history"
		}
	}
	assertFixtureRows(t, e, historyRows)
	exerciseEngineRows(t, a, fmt.Sprintf("sql-scale-%d", time.Now().UnixNano()))
	first := newFixtureRow(t, "messages", "rollback", map[string]any{"messageId": "existing", "timestamp": 1})
	result, err := a.Commit(ctx, []Write{{Kind: "put", Entity: "messages", Row: first}})
	if err != nil || !result.OK {
		t.Fatal("seed", err)
	}
	other := newFixtureRow(t, "messages", "rollback", map[string]any{"messageId": "new", "timestamp": 1})
	wrong := int64(99)
	result, err = a.Commit(ctx, []Write{{Kind: "put", Entity: "messages", Row: other}, {Kind: "delete", Entity: "messages", ID: first["_id"].(string), ExpectedRev: &wrong}})
	if err != nil || result.OK {
		t.Fatal("rollback conflict", err)
	}
	rows, err := a.Get(ctx, "messages", []string{other["_id"].(string)})
	if err != nil || len(rows) != 0 {
		t.Fatal("partial native transaction", err)
	}
	if _, err = a.Commit(ctx, []Write{{Kind: "delete", Entity: "messages", ID: first["_id"].(string)}}); err == nil {
		t.Fatal("unfenced delete accepted")
	}
	if err = a.Close(); err != nil {
		t.Fatal(err)
	}
	if err = a.db.PingContext(ctx); err != nil {
		t.Fatal("borrowed client closed", err)
	}
	if _, err := a.db.ExecContext(ctx, "UPDATE "+a.table("storage_schema")+" SET "+a.q("version")+" = 3"); err != nil {
		t.Fatal(err)
	}
	if _, err = NewSQLAdapter(ctx, a.db, a.dialect, a.options); err == nil {
		t.Fatal("setup overwrote schema version")
	}
	var version int
	if err = a.db.QueryRowContext(ctx, "SELECT "+a.q("version")+" FROM "+a.table("storage_schema")).Scan(&version); err != nil || version != 3 {
		t.Fatal("mismatch changed schema", err)
	}
	if _, err = a.Get(ctx, "messages", nil); err == nil {
		t.Fatal("existing client ignored schema mismatch")
	}
}
func TestSQLiteOfficialDriverConformance(t *testing.T) {
	exerciseSQLAdapter(t, sqlAdapterFor(t, SQLite, sqliteDB(t)))
}
func TestSQLNativePostgresMySQLConformance(t *testing.T) {
	path := os.Getenv("POLYMORFA_SQL_FIXTURE_METADATA")
	if path == "" {
		t.Skip("Requires task-owned PostgreSQL/MySQL fixture metadata")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var meta map[string]string
	if json.Unmarshal(raw, &meta) != nil {
		t.Fatal("metadata")
	}
	for _, dialect := range []SQLDialect{PostgreSQL, MySQL} {
		t.Run(string(dialect), func(t *testing.T) {
			driver := "pgx"
			if dialect == MySQL {
				driver = "mysql"
			}
			db, err := sql.Open(driver, meta[string(dialect)])
			if err != nil {
				t.Fatal("open native SQL fixture")
			}
			defer db.Close()
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			for {
				if db.PingContext(ctx) == nil {
					break
				}
				if ctx.Err() != nil {
					t.Fatal("native SQL fixture unavailable")
				}
				time.Sleep(100 * time.Millisecond)
			}
			a := sqlAdapterFor(t, dialect, db)
			exerciseSQLAdapter(t, a)
			if dialect == MySQL {
				options := SQLOptions{TablePrefix: fmt.Sprintf("myisam_%d_", time.Now().UnixNano()%1000000000000)}
				table := sqlTable(MySQL, "messages", options)
				if _, err := db.ExecContext(ctx, "CREATE TABLE "+table+" (_id varchar(100) PRIMARY KEY) ENGINE=MyISAM"); err != nil {
					t.Fatal(err)
				}
				if _, err := NewSQLAdapter(ctx, db, dialect, options); err == nil {
					t.Fatal("nontransactional MySQL engine accepted")
				}
			}
		})
	}
}
func TestSQLIdentifierOwnershipAndMigration(t *testing.T) {
	for _, bad := range []SQLOptions{{TablePrefix: "unsafe;drop"}, {TablePrefix: strings.Repeat("x", 31)}, {Schema: "public;drop"}} {
		if _, err := SQLSchemaStatements(PostgreSQL, bad); err == nil {
			t.Fatal("unsafe naming accepted")
		}
	}
	db := sqliteDB(t)
	a := sqlAdapterFor(t, SQLite, db)
	migration, err := SQLMigration(SQLite, a.options)
	if err != nil || !strings.Contains(migration, "storage_schema") || strings.Contains(migration, "DO UPDATE") {
		t.Fatal("schema migration may repin existing version", err)
	}
	ownOptions := SQLOptions{TablePrefix: "owned_", OwnsClient: true}
	own, err := NewSQLAdapter(context.Background(), db, SQLite, ownOptions)
	if err != nil {
		t.Fatal(err)
	}
	if err = own.Close(); err != nil {
		t.Fatal(err)
	}
	if db.Ping() == nil || own.Capabilities().AtomicCommit {
		t.Fatal("owned client not closed")
	}
}

func TestLibSQLNativeHTTPConformance(t *testing.T) {
	endpoint := os.Getenv("POLYMORFA_LIBSQL_FIXTURE_URL")
	if endpoint == "" {
		t.Skip("Requires actual libSQL HTTP server")
	}
	db, err := sql.Open("libsql", endpoint)
	if err != nil {
		t.Fatal("open libSQL driver")
	}
	defer db.Close()
	a, err := NewLibSQLAdapter(context.Background(), db, SQLOptions{TablePrefix: fmt.Sprintf("libsql_%d_", time.Now().UnixNano()%1000000000000)})
	if err != nil {
		t.Fatal(err)
	}
	exerciseSQLAdapter(t, a)
}
