package scenes

import "testing"

func TestWallBlocksMovement(t *testing.T) {
	walls := []Wall{{StartX: 70, StartY: -70, EndX: 70, EndY: 140}}
	if !wallBlocksMovement(0, 0, 1, 140, 0, 70, walls) {
		t.Fatal("expected a vertical wall to block a crossing movement")
	}
}

func TestWallDoesNotBlockMovementOnSameSide(t *testing.T) {
	walls := []Wall{{StartX: 70, StartY: -70, EndX: 70, EndY: 140}}
	if wallBlocksMovement(-140, 0, 1, -70, 0, 70, walls) {
		t.Fatal("wall must not block movement that stays on its side")
	}
}

func TestOpenDoorDoesNotBlockMovement(t *testing.T) {
	walls := []Wall{{StartX: 70, StartY: -70, EndX: 70, EndY: 140, Kind: "door", Open: true}}
	if wallBlocksMovement(0, 0, 1, 140, 0, 70, walls) {
		t.Fatal("an open door must not block movement")
	}
}
