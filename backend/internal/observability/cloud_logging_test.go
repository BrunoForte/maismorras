package observability

import "testing"

func TestSafeUUIDRejectsArbitraryInput(t *testing.T) {
	const valid = "7b98efb1-0fb3-4f35-ae27-a832632ae9d4"
	if !IsUUID(valid) || SafeUUID(valid) != valid {
		t.Fatalf("valid UUID was not preserved")
	}
	for _, invalid := range []string{"player@example.test", "token=secret", "scene-1", "", valid + "?secret=1"} {
		if IsUUID(invalid) || SafeUUID(invalid) != "" {
			t.Fatalf("unsafe log identifier accepted: %q", invalid)
		}
	}
}
