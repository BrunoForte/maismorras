package notes

import (
	"strings"
	"testing"
)

func TestListQueryUsesOnlyParametersPresentForGM(t *testing.T) {
	t.Parallel()
	query, args := listQuery("gm", "campaign-id", "gm-id")
	if len(args) != 1 || args[0] != "campaign-id" {
		t.Fatalf("GM query args = %#v, want only campaign id", args)
	}
	if strings.Contains(query, "$2") {
		t.Fatalf("GM query unexpectedly references second parameter: %s", query)
	}
}

func TestListQueryKeepsPermissionFilterForPlayers(t *testing.T) {
	t.Parallel()
	query, args := listQuery("player", "campaign-id", "player-id")
	if len(args) != 2 || args[0] != "campaign-id" || args[1] != "player-id" {
		t.Fatalf("player query args = %#v, want campaign and player ids", args)
	}
	if !strings.Contains(query, "$2") || !strings.Contains(query, "library_item_permissions") {
		t.Fatalf("player query lost individual-permission filtering: %s", query)
	}
}
