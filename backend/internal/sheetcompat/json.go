// Package sheetcompat preserves JSON fields written by newer backend versions
// when an older typed sheet model updates an actor's JSONB document.
package sheetcompat

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
)

// MarshalPreservingUnknown marshals value using its current Go schema, then
// copies forward only stored JSON properties that schema does not know. The
// stored document is the sole source for unknown properties: unknown keys in
// value are removed, so request data cannot introduce or replace them.
//
// Nested object fields are handled against the corresponding Go struct type.
// Struct slices are matched by their stable JSON "id" field so reordering an
// editable list does not attach one record's newer fields to another record.
func MarshalPreservingUnknown(stored []byte, value any) ([]byte, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	stored = bytes.TrimSpace(stored)
	if len(stored) == 0 || bytes.Equal(stored, []byte("null")) {
		return encoded, nil
	}
	t := reflect.TypeOf(value)
	if t == nil {
		return nil, fmt.Errorf("cannot preserve fields for a nil sheet model")
	}
	merged, err := preserveUnknown(stored, encoded, t)
	if err != nil {
		return nil, fmt.Errorf("preserve stored sheet fields: %w", err)
	}
	return merged, nil
}

func preserveUnknown(stored, current []byte, t reflect.Type) ([]byte, error) {
	t = indirect(t)
	switch t.Kind() {
	case reflect.Struct:
		if !isJSONContainer(stored, '{') || !isJSONContainer(current, '{') {
			return current, nil
		}
		var oldFields, newFields map[string]json.RawMessage
		if err := json.Unmarshal(stored, &oldFields); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(current, &newFields); err != nil {
			return nil, err
		}
		knownFields, err := jsonStructFields(t)
		if err != nil {
			return nil, err
		}

		// A typed model cannot ordinarily marshal unknown keys. Keep the guard
		// here as well so a future caller cannot smuggle one through this helper.
		for key := range newFields {
			if _, known := knownFields[key]; known {
				continue
			}
			if oldValue, exists := oldFields[key]; exists {
				newFields[key] = oldValue
			} else {
				delete(newFields, key)
			}
		}

		for key, oldValue := range oldFields {
			fieldType, known := knownFields[key]
			newValue, present := newFields[key]
			if !known {
				if !present {
					newFields[key] = oldValue
				}
				continue
			}
			// A known optional field omitted by the typed model is an intentional
			// update/removal, not an unknown field to restore.
			if !present {
				continue
			}
			merged, err := preserveUnknown(oldValue, newValue, fieldType)
			if err != nil {
				return nil, fmt.Errorf("field %q: %w", key, err)
			}
			newFields[key] = merged
		}
		return json.Marshal(newFields)

	case reflect.Slice, reflect.Array:
		if !isJSONContainer(stored, '[') || !isJSONContainer(current, '[') {
			return current, nil
		}
		elementType := indirect(t.Elem())
		if elementType.Kind() != reflect.Struct {
			return current, nil
		}
		if _, hasID := jsonStringIdentityField(elementType); !hasID {
			if !isJSONContainer(current, '[') || bytes.Equal(bytes.TrimSpace(current), []byte("[]")) {
				return current, nil
			}
			hasUnknown, err := containsUnknownFields(stored, elementType)
			if err != nil {
				return nil, err
			}
			if hasUnknown {
				return nil, fmt.Errorf("cannot safely match unknown fields in a non-ID-keyed slice of %s", elementType)
			}
			return current, nil
		}
		var oldItems, newItems []json.RawMessage
		if err := json.Unmarshal(stored, &oldItems); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(current, &newItems); err != nil {
			return nil, err
		}
		oldByID, err := indexByID(oldItems, elementType)
		if err != nil {
			return nil, err
		}
		currentHasUnkeyedItem := false
		for _, newItem := range newItems {
			if _, ok, err := jsonIdentity(newItem, elementType); err != nil {
				return nil, err
			} else if !ok {
				currentHasUnkeyedItem = true
			}
		}
		if currentHasUnkeyedItem {
			for _, oldItem := range oldItems {
				unknown, err := containsUnknownFields(oldItem, elementType)
				if err != nil {
					return nil, err
				}
				if unknown {
					return nil, fmt.Errorf("cannot safely match stored unknown fields to an item without stable id")
				}
			}
		}
		seen := make(map[string]struct{}, len(newItems))
		for index, newItem := range newItems {
			id, ok, err := jsonIdentity(newItem, elementType)
			if err != nil {
				return nil, err
			}
			if !ok {
				continue
			}
			if _, duplicate := seen[id]; duplicate {
				return nil, fmt.Errorf("duplicate stable id %q in updated slice", id)
			}
			seen[id] = struct{}{}
			if oldItem, exists := oldByID[id]; exists {
				merged, err := preserveUnknown(oldItem, newItem, elementType)
				if err != nil {
					return nil, fmt.Errorf("slice item %q: %w", id, err)
				}
				newItems[index] = merged
			}
		}
		return json.Marshal(newItems)

	case reflect.Map:
		if t.Key().Kind() != reflect.String || !isJSONContainer(stored, '{') || !isJSONContainer(current, '{') {
			return current, nil
		}
		var oldValues, newValues map[string]json.RawMessage
		if err := json.Unmarshal(stored, &oldValues); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(current, &newValues); err != nil {
			return nil, err
		}
		for key, newValue := range newValues {
			if oldValue, exists := oldValues[key]; exists {
				merged, err := preserveUnknown(oldValue, newValue, t.Elem())
				if err != nil {
					return nil, fmt.Errorf("map key %q: %w", key, err)
				}
				newValues[key] = merged
			}
		}
		return json.Marshal(newValues)
	default:
		return current, nil
	}
}

func containsUnknownFields(raw []byte, t reflect.Type) (bool, error) {
	t = indirect(t)
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || bytes.Equal(raw, []byte("null")) || t == reflect.TypeOf(json.RawMessage{}) || t.Kind() == reflect.Interface {
		return false, nil
	}
	switch raw[0] {
	case '{':
		switch t.Kind() {
		case reflect.Struct:
			var values map[string]json.RawMessage
			if err := json.Unmarshal(raw, &values); err != nil {
				return false, err
			}
			known, err := jsonStructFields(t)
			if err != nil {
				return false, err
			}
			for key, value := range values {
				fieldType, exists := known[key]
				if !exists {
					return true, nil
				}
				unknown, err := containsUnknownFields(value, fieldType)
				if err != nil || unknown {
					return unknown, err
				}
			}
		case reflect.Map:
			if t.Key().Kind() != reflect.String {
				return false, nil
			}
			var values map[string]json.RawMessage
			if err := json.Unmarshal(raw, &values); err != nil {
				return false, err
			}
			for _, value := range values {
				unknown, err := containsUnknownFields(value, t.Elem())
				if err != nil || unknown {
					return unknown, err
				}
			}
		}
	case '[':
		elementType := t
		if t.Kind() == reflect.Slice || t.Kind() == reflect.Array {
			elementType = indirect(t.Elem())
		} else if t.Kind() != reflect.Struct {
			return false, nil
		}
		var values []json.RawMessage
		if err := json.Unmarshal(raw, &values); err != nil {
			return false, err
		}
		for _, value := range values {
			unknown, err := containsUnknownFields(value, elementType)
			if err != nil || unknown {
				return unknown, err
			}
		}
	}
	return false, nil
}

func indexByID(items []json.RawMessage, t reflect.Type) (map[string]json.RawMessage, error) {
	indexed := make(map[string]json.RawMessage, len(items))
	for _, item := range items {
		id, ok, err := jsonIdentity(item, t)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		if _, duplicate := indexed[id]; duplicate {
			return nil, fmt.Errorf("duplicate stable id %q in stored slice", id)
		}
		indexed[id] = item
	}
	return indexed, nil
}

func jsonIdentity(raw []byte, t reflect.Type) (string, bool, error) {
	fieldName, ok := jsonStringIdentityField(t)
	if !ok || !isJSONContainer(raw, '{') {
		return "", false, nil
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return "", false, err
	}
	value, exists := fields[fieldName]
	if !exists || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
		return "", false, nil
	}
	var id string
	if err := json.Unmarshal(value, &id); err != nil {
		return "", false, fmt.Errorf("stable id %q is not a string: %w", fieldName, err)
	}
	if id == "" {
		return "", false, nil
	}
	return id, true, nil
}

func jsonStringIdentityField(t reflect.Type) (string, bool) {
	fields, err := jsonStructFields(indirect(t))
	if err != nil {
		return "", false
	}
	fieldType, ok := fields["id"]
	if !ok || indirect(fieldType).Kind() != reflect.String {
		return "", false
	}
	return "id", true
}

func jsonStructFields(t reflect.Type) (map[string]reflect.Type, error) {
	t = indirect(t)
	if t.Kind() != reflect.Struct {
		return nil, fmt.Errorf("expected struct type, got %s", t.Kind())
	}
	fields := make(map[string]reflect.Type, t.NumField())
	for index := 0; index < t.NumField(); index++ {
		field := t.Field(index)
		if field.PkgPath != "" {
			continue
		}
		name := strings.Split(field.Tag.Get("json"), ",")[0]
		if name == "-" {
			continue
		}
		if name == "" {
			name = field.Name
		}
		if _, exists := fields[name]; exists {
			return nil, fmt.Errorf("ambiguous JSON field %q in %s", name, t)
		}
		fields[name] = field.Type
	}
	return fields, nil
}

func indirect(t reflect.Type) reflect.Type {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	return t
}

func isJSONContainer(raw []byte, opening byte) bool {
	raw = bytes.TrimSpace(raw)
	return len(raw) > 0 && raw[0] == opening
}
