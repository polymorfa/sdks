package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"

	"github.com/go-sql-driver/mysql"
)

type SQLDialect string

const (
	PostgreSQL SQLDialect = "postgres"
	MySQL      SQLDialect = "mysql"
	SQLite     SQLDialect = "sqlite"
)

type SQLOptions struct {
	TablePrefix   string
	Schema        string
	CreateTables  *bool
	OwnsClient    bool
	MaxCommitSize int
}

// SQLAdapter borrows a standard database/sql pool unless OwnsClient is selected.
// Supported driver transaction semantics are verified by native conformance tests.
type SQLAdapter struct {
	db       *sql.DB
	dialect  SQLDialect
	options  SQLOptions
	verified atomic.Bool
	closed   atomic.Bool
}

var sqlIdentifier = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

func sqlColumn(field string) string {
	if strings.HasPrefix(field, "_") {
		return field
	}
	var b strings.Builder
	for _, r := range field {
		if r >= 'A' && r <= 'Z' {
			b.WriteRune('_')
			b.WriteRune(r + ('a' - 'A'))
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}
func sqlQuote(dialect SQLDialect, name string) string {
	if dialect == MySQL {
		return "`" + name + "`"
	}
	return `"` + name + `"`
}
func sqlTable(dialect SQLDialect, name string, options SQLOptions) string {
	table := sqlQuote(dialect, options.TablePrefix+name)
	if options.Schema != "" {
		return sqlQuote(dialect, options.Schema) + "." + table
	}
	return table
}
func sqlOptions(dialect SQLDialect, options SQLOptions) (SQLOptions, error) {
	if dialect != PostgreSQL && dialect != MySQL && dialect != SQLite {
		return options, invalid()
	}
	if options.TablePrefix == "" {
		options.TablePrefix = "polymorfa_"
	}
	if !sqlIdentifier.MatchString(options.TablePrefix) || len(options.TablePrefix) > 30 || options.Schema != "" && (dialect != PostgreSQL || !sqlIdentifier.MatchString(options.Schema) || len(options.Schema) > 63) {
		return options, invalid()
	}
	if options.MaxCommitSize == 0 {
		options.MaxCommitSize = 500
	}
	if options.MaxCommitSize < 2 || options.MaxCommitSize > 1000 {
		return options, invalid()
	}
	return options, nil
}
func sqlEntities() []string {
	names := []string{}
	for entity := range schema {
		names = append(names, entity)
	}
	sort.Strings(names)
	return names
}
func sqlFields(entity string) []string {
	d := schema[entity]
	fields := []string{"_id"}
	fields = append(fields, d.Key...)
	names := []string{}
	for name := range d.Fields {
		names = append(names, name)
	}
	sort.Strings(names)
	fields = append(fields, names...)
	return append(fields, "_rev", "_v")
}

// SQLSchemaStatements exports the shared schema2 columns/indexes. It never
// changes an existing schema version. Setup records version2 only when absent.
func SQLSchemaStatements(dialect SQLDialect, options SQLOptions) ([]string, error) {
	var err error
	options, err = sqlOptions(dialect, options)
	if err != nil {
		return nil, err
	}
	q := func(name string) string { return sqlQuote(dialect, sqlColumn(name)) }
	kind := func(fieldType string) string {
		switch dialect {
		case PostgreSQL:
			switch fieldType {
			case "key":
				return "text"
			case "id":
				return `text COLLATE "C"`
			case "number":
				return "double precision"
			case "boolean":
				return "boolean"
			case "json":
				return "jsonb"
			}
		case MySQL:
			switch fieldType {
			case "key":
				return "varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin"
			case "id":
				return "varchar(1024) CHARACTER SET ascii COLLATE ascii_bin"
			case "number":
				return "double"
			case "boolean":
				return "tinyint(1)"
			case "json":
				return "json"
			}
			return "mediumtext"
		case SQLite:
			switch fieldType {
			case "number":
				return "real"
			case "boolean":
				return "integer"
			}
		}
		return "text"
	}
	statements := []string{}
	if options.Schema != "" {
		statements = append(statements, "CREATE SCHEMA IF NOT EXISTS "+sqlQuote(dialect, options.Schema))
	}
	for _, entity := range sqlEntities() {
		d := schema[entity]
		cols := []string{q("_id") + " " + kind("id") + " NOT NULL PRIMARY KEY"}
		for _, key := range d.Key {
			cols = append(cols, q(key)+" "+kind("key")+" NOT NULL")
		}
		names := sqlFields(entity)
		for _, f := range names[1+len(d.Key) : len(names)-2] {
			fieldType := d.Fields[f]
			if dialect == MySQL && fieldType == "string" {
				for _, idx := range d.Indexes {
					for _, equal := range idx.Equals {
						if equal == f {
							fieldType = "key"
						}
					}
				}
			}
			cols = append(cols, q(f)+" "+kind(fieldType))
		}
		cols = append(cols, q("_rev")+" bigint NOT NULL", q("_v")+" "+kind("json")+" NOT NULL")
		indexes := []string{}
		for _, idx := range d.Indexes {
			fields := append(append([]string{}, idx.Equals...), idx.Sort, "_id")
			for i, f := range fields {
				fields[i] = q(f)
			}
			index := sqlQuote(dialect, options.TablePrefix+entity+"_"+idx.Name)
			if dialect == MySQL {
				cols = append(cols, "KEY "+index+" ("+strings.Join(fields, ", ")+")")
			} else {
				indexes = append(indexes, "CREATE INDEX IF NOT EXISTS "+index+" ON "+sqlTable(dialect, entity, options)+" ("+strings.Join(fields, ", ")+")")
			}
		}
		if dialect == MySQL {
			fields := []string{}
			for _, f := range d.Key {
				fields = append(fields, q(f))
			}
			cols = append(cols, "UNIQUE KEY "+sqlQuote(dialect, options.TablePrefix+entity+"_key")+" ("+strings.Join(fields, ", ")+")")
		}
		statement := "CREATE TABLE IF NOT EXISTS " + sqlTable(dialect, entity, options) + " (" + strings.Join(cols, ", ") + ")"
		if dialect == MySQL {
			statement += " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin"
		}
		statements = append(statements, statement)
		statements = append(statements, indexes...)
	}
	statements = append(statements, "CREATE TABLE IF NOT EXISTS "+sqlTable(dialect, "storage_schema", options)+" ("+q("id")+" "+kind("key")+" PRIMARY KEY, "+q("version")+" integer NOT NULL)")
	return statements, nil
}
func NewSQLAdapter(ctx context.Context, db *sql.DB, dialect SQLDialect, options SQLOptions) (*SQLAdapter, error) {
	if db == nil {
		return nil, invalid()
	}
	options, err := sqlOptions(dialect, options)
	if err != nil {
		return nil, err
	}
	a := &SQLAdapter{db: db, dialect: dialect, options: options}
	if options.CreateTables == nil || *options.CreateTables {
		err = a.Setup(ctx)
	} else {
		err = a.verify(ctx)
	}
	if err != nil {
		return nil, err
	}
	return a, nil
}
func (a *SQLAdapter) mark(i int) string {
	if a.dialect == PostgreSQL {
		return "$" + strconv.Itoa(i)
	}
	return "?"
}
func (a *SQLAdapter) q(name string) string       { return sqlQuote(a.dialect, sqlColumn(name)) }
func (a *SQLAdapter) table(entity string) string { return sqlTable(a.dialect, entity, a.options) }
func (a *SQLAdapter) version(ctx context.Context) (int, error) {
	var version int
	err := a.db.QueryRowContext(ctx, "SELECT "+a.q("version")+" FROM "+a.table("storage_schema")+" WHERE "+a.q("id")+" = 'storage'").Scan(&version)
	return version, err
}
func sqlMissing(err error) bool {
	if strings.Contains(err.Error(), "no such table:") {
		return true
	}
	var state interface{ SQLState() string }
	if errors.As(err, &state) {
		return state.SQLState() == "42P01" || state.SQLState() == "3F000"
	}
	var my *mysql.MySQLError
	if errors.As(err, &my) {
		return my.Number == 1146 || my.Number == 1049
	}
	var sqlite interface{ Code() int }
	if errors.As(err, &sqlite) {
		return sqlite.Code() == 1 && strings.Contains(err.Error(), "no such table")
	}
	return false
}
func sqlConflict(err error) bool {
	for _, code := range []string{"SQLITE_CONSTRAINT", "UNIQUE constraint failed:", "NOT NULL constraint failed:", "SQLITE_BUSY", "database is locked"} {
		if strings.Contains(err.Error(), code) {
			return true
		}
	}
	var state interface{ SQLState() string }
	if errors.As(err, &state) {
		switch state.SQLState() {
		case "23505", "40001", "40P01", "55P03":
			return true
		}
	}
	var my *mysql.MySQLError
	if errors.As(err, &my) {
		return my.Number == 1062 || my.Number == 1213 || my.Number == 1205
	}
	var sqlite interface{ Code() int }
	if errors.As(err, &sqlite) {
		switch sqlite.Code() & 255 {
		case 5, 6, 19:
			return true
		}
	}
	return false
}
func sqlFailure(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return storageError("storage_sql_failed")
}
func (a *SQLAdapter) verify(ctx context.Context) error {
	if a.closed.Load() {
		return storageError("storage_closed")
	}
	v, err := a.version(ctx)
	if err != nil {
		return sqlFailure(ctx)
	}
	if v != SchemaVersion {
		return storageError("storage_schema_mismatch")
	}

	if a.dialect == MySQL {
		expected := map[string]bool{a.options.TablePrefix + "storage_schema": true}
		for _, entity := range sqlEntities() {
			expected[a.options.TablePrefix+entity] = true
		}
		rows, err := a.db.QueryContext(ctx, "SELECT table_name, engine FROM information_schema.tables WHERE table_schema = DATABASE()")
		if err != nil {
			return sqlFailure(ctx)
		}
		for rows.Next() {
			var table, engine string
			if rows.Scan(&table, &engine) != nil {
				rows.Close()
				return invalid()
			}
			if expected[table] {
				if !strings.EqualFold(engine, "InnoDB") {
					rows.Close()
					return storageError("storage_mysql_requires_innodb")
				}
				delete(expected, table)
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return sqlFailure(ctx)
		}
		if len(expected) != 0 {
			return storageError("storage_schema_incomplete")
		}
	}
	a.verified.Store(true)
	return nil
}
func (a *SQLAdapter) Capabilities() Capabilities {
	if a == nil || !a.verified.Load() || a.closed.Load() {
		return Capabilities{}
	}
	return Capabilities{true, a.options.MaxCommitSize}
}
func (a *SQLAdapter) Setup(ctx context.Context) error {
	if a.options.CreateTables != nil && !*a.options.CreateTables {
		return a.verify(ctx)
	}
	version, err := a.version(ctx)
	if err == nil && version != SchemaVersion {
		return storageError("storage_schema_mismatch")
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) && !sqlMissing(err) {
		return sqlFailure(ctx)
	}
	statements, err := SQLSchemaStatements(a.dialect, a.options)
	if err != nil {
		return err
	}
	for _, statement := range statements {
		if _, err = a.db.ExecContext(ctx, statement); err != nil {
			return sqlFailure(ctx)
		}
	}
	insert := "INSERT INTO "
	if a.dialect == MySQL {
		insert = "INSERT IGNORE INTO "
	}
	insert += a.table("storage_schema") + " (" + a.q("id") + ", " + a.q("version") + ") VALUES ('storage', 2)"
	if a.dialect != MySQL {
		insert += " ON CONFLICT (" + a.q("id") + ") DO NOTHING"
	}
	if _, err = a.db.ExecContext(ctx, insert); err != nil {
		return sqlFailure(ctx)
	}
	return a.verify(ctx)
}
func (a *SQLAdapter) Close() error {
	if a.options.OwnsClient {
		a.closed.Store(true)
		if a.db.Close() != nil {
			return storageError("storage_sql_close_failed")
		}
	}
	return nil
}
func (*SQLAdapter) String() string               { return "SQLAdapter[redacted]" }
func (a *SQLAdapter) GoString() string           { return a.String() }
func (*SQLAdapter) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }
func (a *SQLAdapter) decodeRows(entity string, rows *sql.Rows) ([]Row, error) {
	fields := sqlFields(entity)
	out := []Row{}
	for rows.Next() {
		values := make([]any, len(fields))
		ptrs := make([]any, len(fields))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if rows.Scan(ptrs...) != nil {
			return nil, invalid()
		}
		row := Row{}
		for i, f := range fields {
			v := values[i]
			kind := schema[entity].Fields[f]
			if f == "_v" {
				kind = "json"
			}
			if f == "_rev" {
				kind = "number"
			}
			if v == nil {
				row[f] = nil
				continue
			}
			if raw, ok := v.([]byte); ok {
				v = string(raw)
			}
			switch kind {
			case "json":
				if raw, ok := v.(string); ok {
					var parsed any
					if json.Unmarshal([]byte(raw), &parsed) != nil {
						return nil, invalid()
					}
					v = parsed
				} else {
					return nil, invalid()
				}
			case "number":
				n, ok := finite(v)
				if !ok {
					return nil, invalid()
				}
				v = n
			case "boolean":
				switch b := v.(type) {
				case bool:
					v = b
				case int64:
					if b != 0 && b != 1 {
						return nil, invalid()
					}
					v = b == 1
				case string:
					if b != "0" && b != "1" {
						return nil, invalid()
					}
					v = b == "1"
				default:
					return nil, invalid()
				}
			default:
				if _, ok := v.(string); !ok {
					return nil, invalid()
				}
			}
			row[f] = v
		}
		if ValidateRow(entity, row) != nil {
			return nil, invalid()
		}
		out = append(out, row)
	}
	if rows.Err() != nil {
		return nil, storageError("storage_sql_failed")
	}
	return out, nil
}
func (a *SQLAdapter) selectFields(entity string) string {
	fields := sqlFields(entity)
	for i, f := range fields {
		fields[i] = a.q(f)
	}
	return strings.Join(fields, ", ")
}
func (a *SQLAdapter) Get(ctx context.Context, entity string, ids []string) (map[string]Row, error) {
	if _, err := DefinitionOf(entity); err != nil {
		return nil, err
	}
	if err := a.verify(ctx); err != nil {
		return nil, err
	}
	out := map[string]Row{}
	for start := 0; start < len(ids); start += 500 {
		end := min(start+500, len(ids))
		params := []any{}
		marks := []string{}
		allowed := map[string]bool{}
		for _, id := range ids[start:end] {
			if id == "" || len(id) > 4096 {
				return nil, invalid()
			}
			params = append(params, id)
			marks = append(marks, a.mark(len(params)))
			allowed[id] = true
		}
		rows, err := a.db.QueryContext(ctx, "SELECT "+a.selectFields(entity)+" FROM "+a.table(entity)+" WHERE "+a.q("_id")+" IN ("+strings.Join(marks, ", ")+")", params...)
		if err != nil {
			return nil, sqlFailure(ctx)
		}
		decoded, err := a.decodeRows(entity, rows)
		rows.Close()
		if err != nil {
			return nil, err
		}
		for _, row := range decoded {
			id := row["_id"].(string)
			if !allowed[id] {
				return nil, invalid()
			}
			out[id] = row
		}
	}
	return out, nil
}
func (a *SQLAdapter) Query(ctx context.Context, entity string, q Query) ([]Row, error) {
	idx, err := validateQuery(entity, q, 10000)
	if err != nil {
		return nil, err
	}
	if err = a.verify(ctx); err != nil {
		return nil, err
	}
	where := []string{}
	params := []any{}
	param := func(v any) string { params = append(params, v); return a.mark(len(params)) }
	for _, field := range idx.Equals {
		where = append(where, a.q(field)+" = "+param(q.Equals[field]))
	}
	for _, rangeOp := range []string{"gt", "gte", "lt", "lte"} {
		if value, ok := q.Range[rangeOp]; ok {
			op := map[string]string{"gt": ">", "gte": ">=", "lt": "<", "lte": "<="}[rangeOp]
			where = append(where, a.q(idx.Sort)+" "+op+" "+param(value))
		}
	}
	direction, op := "ASC", ">"
	if q.Order == "desc" {
		direction, op = "DESC", "<"
	}
	if q.After != nil {
		where = append(where, "("+a.q(idx.Sort)+" "+op+" "+param(q.After.Sort)+" OR ("+a.q(idx.Sort)+" = "+param(q.After.Sort)+" AND "+a.q("_id")+" "+op+" "+param(q.After.ID)+"))")
	}
	statement := "SELECT " + a.selectFields(entity) + " FROM " + a.table(entity) + " WHERE " + strings.Join(where, " AND ") + " ORDER BY " + a.q(idx.Sort) + " " + direction + ", " + a.q("_id") + " " + direction + " LIMIT " + param(q.Limit)
	rows, err := a.db.QueryContext(ctx, statement, params...)
	if err != nil {
		return nil, sqlFailure(ctx)
	}
	defer rows.Close()
	return a.decodeRows(entity, rows)
}
func (a *SQLAdapter) sqlValue(entity, field string, v any) (any, error) {
	if v == nil {
		return nil, nil
	}
	if field == "_rev" {
		rev, ok := revision(v)
		if !ok {
			return nil, invalid()
		}
		return rev, nil
	}
	kind := schema[entity].Fields[field]
	if kind == "json" || field == "_v" {
		raw, err := json.Marshal(v)
		if err != nil {
			return nil, invalid()
		}
		return string(raw), nil
	}
	if b, ok := v.(bool); ok && a.dialect != PostgreSQL {
		if b {
			return int64(1), nil
		}
		return int64(0), nil
	}
	return v, nil
}
func (a *SQLAdapter) writeStatement(w Write) (string, []any, error) {
	id := w.ID
	if w.Kind == "put" {
		id = w.Row["_id"].(string)
	}
	if w.Kind == "delete" {
		params := []any{id}
		statement := "DELETE FROM " + a.table(w.Entity) + " WHERE " + a.q("_id") + " = " + a.mark(1)
		if w.ExpectedRev != nil {
			params = append(params, *w.ExpectedRev)
			statement += " AND " + a.q("_rev") + " = " + a.mark(2)
		}
		return statement, params, nil
	}
	fields := sqlFields(w.Entity)
	params := []any{}
	columns, marks, sets := []string{}, []string{}, []string{}
	for _, f := range fields {
		if w.ExpectedRev != nil && f == "_id" {
			continue
		}
		value, err := a.sqlValue(w.Entity, f, w.Row[f])
		if err != nil {
			return "", nil, err
		}
		params = append(params, value)
		mark := a.mark(len(params))
		if a.dialect == PostgreSQL && (schema[w.Entity].Fields[f] == "json" || f == "_v") {
			mark += "::jsonb"
		}
		columns = append(columns, a.q(f))
		marks = append(marks, mark)
		sets = append(sets, a.q(f)+" = "+mark)
	}
	if w.ExpectedRev == nil {
		return "INSERT INTO " + a.table(w.Entity) + " (" + strings.Join(columns, ", ") + ") VALUES (" + strings.Join(marks, ", ") + ")", params, nil
	}
	params = append(params, id, *w.ExpectedRev)
	return "UPDATE " + a.table(w.Entity) + " SET " + strings.Join(sets, ", ") + " WHERE " + a.q("_id") + " = " + a.mark(len(params)-1) + " AND " + a.q("_rev") + " = " + a.mark(len(params)), params, nil
}
func validateFencedDeletes(writes []Write) error {
	for _, w := range writes {
		if w.Kind != "delete" || w.ExpectedRev != nil {
			continue
		}
		session := strings.Split(w.ID, ":")[0]
		fenced := false
		for _, f := range writes {
			if f.Kind == "put" && f.Entity == "leases" && f.ExpectedRev != nil && f.Row["_id"] == session {
				rev, ok := revision(f.Row["_rev"])
				if ok && rev == *f.ExpectedRev+1 {
					fenced = true
				}
			}
		}
		if !fenced {
			return invalid()
		}
	}
	return nil
}
func (a *SQLAdapter) Commit(ctx context.Context, writes []Write) (CommitResult, error) {
	if err := ValidateWrites(writes, a.options.MaxCommitSize); err != nil {
		return CommitResult{}, err
	}
	if err := validateFencedDeletes(writes); err != nil {
		return CommitResult{}, err
	}
	if err := a.verify(ctx); err != nil {
		return CommitResult{}, err
	}
	if len(writes) == 0 {
		return CommitResult{OK: true}, nil
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return CommitResult{}, sqlFailure(ctx)
	}
	defer tx.Rollback()
	conflict := func(id string) (CommitResult, error) { return CommitResult{Conflicts: []string{id}}, nil }
	for _, w := range writes {
		id := w.ID
		if w.Kind == "put" {
			id = w.Row["_id"].(string)
		}
		if w.ExpectedRev != nil {
			statement := "SELECT " + a.q("_rev") + " FROM " + a.table(w.Entity) + " WHERE " + a.q("_id") + " = " + a.mark(1)
			if a.dialect != SQLite {
				statement += " FOR UPDATE"
			}
			var live int64
			err = tx.QueryRowContext(ctx, statement, id).Scan(&live)
			if errors.Is(err, sql.ErrNoRows) || err == nil && live != *w.ExpectedRev {
				return conflict(id)
			}
			if err != nil {
				if sqlConflict(err) {
					return conflict(id)
				}
				return CommitResult{}, sqlFailure(ctx)
			}
		}
		statement, params, err := a.writeStatement(w)
		if err != nil {
			return CommitResult{}, err
		}
		if _, err = tx.ExecContext(ctx, statement, params...); err != nil {
			if sqlConflict(err) {
				return conflict(id)
			}
			return CommitResult{}, sqlFailure(ctx)
		}
	}
	if err = tx.Commit(); err != nil {
		if sqlConflict(err) {
			ids := []string{}
			for _, w := range writes {
				id := w.ID
				if w.Kind == "put" {
					id = w.Row["_id"].(string)
				}
				ids = append(ids, id)
			}
			return CommitResult{Conflicts: ids}, nil
		}
		return CommitResult{}, sqlFailure(ctx)
	}
	return CommitResult{OK: true}, nil
}
func SQLMigration(dialect SQLDialect, options SQLOptions) (string, error) {
	statements, err := SQLSchemaStatements(dialect, options)
	if err != nil {
		return "", err
	}
	options, _ = sqlOptions(dialect, options)
	insert := "INSERT INTO "
	if dialect == MySQL {
		insert = "INSERT IGNORE INTO "
	}
	insert += sqlTable(dialect, "storage_schema", options) + " (" + sqlQuote(dialect, "id") + ", " + sqlQuote(dialect, "version") + ") VALUES ('storage', 2)"
	if dialect != MySQL {
		insert += " ON CONFLICT (" + sqlQuote(dialect, "id") + ") DO NOTHING"
	}
	return strings.Join(append(statements, insert), ";\n\n") + ";\n", nil
}

var _ Adapter = (*SQLAdapter)(nil)

// NewLibSQLAdapter uses the same schema2 SQL contract with an application's
// configured official libsql-client-go database/sql pool. Transport timeouts
// remain a property of that driver; the SDK never changes global HTTP settings.
func NewLibSQLAdapter(ctx context.Context, db *sql.DB, options SQLOptions) (*SQLAdapter, error) {
	return NewSQLAdapter(ctx, db, SQLite, options)
}
