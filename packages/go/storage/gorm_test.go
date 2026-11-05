package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"os"
	"testing"
	"time"
)

func TestGORMNativePostgresMetadataInterop(t *testing.T) {
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
		t.Fatal("SQL metadata")
	}
	pool, err := sql.Open("pgx", meta["postgres"])
	if err != nil {
		t.Fatal("native PostgreSQL pool")
	}
	defer pool.Close()
	connection, err := gorm.Open(postgres.New(postgres.Config{Conn: pool}), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal("official GORM PostgreSQL client")
	}
	options := SQLOptions{TablePrefix: fmt.Sprintf("orm_%d_", time.Now().UnixNano()%1000000000000)}
	models, err := GORMModels(PostgreSQL, options)
	if err != nil || len(models) != len(sqlEntities()) {
		t.Fatal("GORM model metadata", err)
	}
	for _, model := range models {
		if err = connection.Table(model.Table).AutoMigrate(model.Value); err != nil {
			t.Fatalf("GORM migration %s %v", model.Entity, err)
		}
	}
	adapter, err := NewSQLAdapter(context.Background(), pool, PostgreSQL, options)
	if err != nil {
		t.Fatal("GORM/SQL schema interop", err)
	}
	e := engineFor(t, adapter, EngineOptions{})
	if _, err = e.Apply(context.Background(), Batch{SessionID: "orm", Operations: []Operation{upsert("messages", "orm", map[string]any{"messageId": "message"}, map[string]any{"chatId": "chat", "text": "typed fixture", "extra": map[string]any{"unknown": false}}, 0)}}); err != nil {
		t.Fatal(err)
	}
	var rows []map[string]any
	if err = connection.Table(options.TablePrefix + "messages").Find(&rows).Error; err != nil || len(rows) != 1 || rows[0]["text"] != "typed fixture" {
		t.Fatal("GORM read native engine row", err)
	}
}
