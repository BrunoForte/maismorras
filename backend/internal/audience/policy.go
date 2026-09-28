// Package audience contains transport- and storage-independent audience rules.
// It answers who may see a resource; authorization to manage that resource stays
// with its owning domain (campaign membership, GM role, and so on).
package audience

type Mode string

const (
	ModeAll      Mode = "all"
	ModeNone     Mode = "none"
	ModeSelected Mode = "selected"
)

// Policy describes visibility to the selected audience. It does not grant
// access to non-members and does not replace owner/GM authorization.
type Policy struct {
	Mode    Mode
	UserIDs []string
}

func (p Policy) Allows(userID string) bool {
	switch p.Mode {
	case ModeAll:
		return true
	case ModeSelected:
		for _, id := range p.UserIDs {
			if id == userID {
				return true
			}
		}
	}
	return false
}
