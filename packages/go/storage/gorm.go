package storage

import (
	"reflect"
	"strconv"
	"strings"
	"unicode"
)

// GORMModel is schema metadata for an application-owned GORM connection. Pass
// Value to db.Table(Table).AutoMigrate, then initialize schema2 with SQLMigration
// or NewSQLAdapter. The engine remains the write/merge authority.
type GORMModel struct {
	Entity string
	Table  string
	Value  any
}

func gormFieldName(field string) string {
	switch field {
	case "_id":
		return "ID"
	case "_rev":
		return "Revision"
	case "_v":
		return "Versions"
	}
	r := []rune(field)
	r[0] = unicode.ToUpper(r[0])
	return string(r)
}
func gormColumnType(dialect SQLDialect, kind string, indexed bool) string {
	switch dialect {
	case PostgreSQL:
		switch kind {
		case "id":
			return `text COLLATE "C"`
		case "number":
			return "double precision"
		case "boolean":
			return "boolean"
		case "json":
			return "jsonb"
		}
		return "text"
	case MySQL:
		switch kind {
		case "id":
			return "varchar(1024) CHARACTER SET ascii COLLATE ascii_bin"
		case "key":
			return "varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin"
		case "number":
			return "double"
		case "boolean":
			return "tinyint(1)"
		case "json":
			return "json"
		}
		if indexed {
			return "varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin"
		}
		return "mediumtext"
	default:
		switch kind {
		case "number":
			return "real"
		case "boolean":
			return "integer"
		}
		return "text"
	}
}
func GORMModels(dialect SQLDialect, settings SQLOptions) ([]GORMModel, error) {
	options, err := sqlOptions(dialect, settings)
	if err != nil {
		return nil, err
	}
	out := []GORMModel{}
	for _, entity := range sqlEntities() {
		definition := schema[entity]
		fields := []reflect.StructField{}
		for _, field := range sqlFields(entity) {
			kind := definition.Fields[field]
			isKey := false
			for _, key := range definition.Key {
				if key == field {
					isKey = true
					kind = "key"
				}
			}
			if field == "_id" {
				kind = "id"
			}
			if field == "_rev" {
				kind = "revision"
			}
			if field == "_v" {
				kind = "versions"
			}
			indexed := false
			for _, idx := range definition.Indexes {
				for _, eq := range idx.Equals {
					if eq == field {
						indexed = true
					}
				}
			}
			var valueType reflect.Type
			switch kind {
			case "id", "key":
				valueType = reflect.TypeOf("")
			case "revision":
				valueType = reflect.TypeOf(int64(0))
			case "versions":
				valueType = reflect.TypeOf(map[string]float64{})
			case "number":
				valueType = reflect.TypeOf((*float64)(nil))
			case "boolean":
				valueType = reflect.TypeOf((*bool)(nil))
			case "json":
				valueType = reflect.TypeOf((*any)(nil)).Elem()
			default:
				valueType = reflect.TypeOf((*string)(nil))
			}
			sqlKind := kind
			if kind == "versions" {
				sqlKind = "json"
			}
			columnType := gormColumnType(dialect, sqlKind, indexed)
			if kind == "revision" {
				columnType = "bigint"
			}
			tags := []string{"column:" + sqlColumn(field), "type:" + columnType}
			if field == "_id" {
				tags = append(tags, "primaryKey")
			}
			if field == "_id" || field == "_rev" || field == "_v" || isKey {
				tags = append(tags, "not null")
			}
			if kind == "json" || kind == "versions" {
				tags = append(tags, "serializer:json")
			}
			for _, idx := range definition.Indexes {
				indexFields := append(append([]string{}, idx.Equals...), idx.Sort, "_id")
				for priority, name := range indexFields {
					if name == field {
						tags = append(tags, "index:"+options.TablePrefix+entity+"_"+idx.Name+",priority:"+strconv.Itoa(priority+1))
					}
				}
			}
			fields = append(fields, reflect.StructField{Name: gormFieldName(field), Type: valueType, Tag: reflect.StructTag("gorm:" + strconv.Quote(strings.Join(tags, ";")) + " json:" + strconv.Quote(field))})
		}
		table := options.TablePrefix + entity
		if options.Schema != "" {
			table = options.Schema + "." + table
		}
		out = append(out, GORMModel{Entity: entity, Table: table, Value: reflect.New(reflect.StructOf(fields)).Interface()})
	}
	return out, nil
}
