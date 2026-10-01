package scenes

import "github.com/jackc/pgx/v5/pgxpool"
import "time"
import "fmt"
import "errors"
import "encoding/json"

type Scene struct {
	ID                         string     `json:"id"`
	CampaignID                 string     `json:"campaignId"`
	Name                       string     `json:"name"`
	BackgroundURL              *string    `json:"backgroundUrl"`
	AmbientAudioPath           *string    `json:"ambientAudioPath"`
	AmbientAudioEnabled        bool       `json:"ambientAudioEnabled"`
	AmbientAudioVolume         int        `json:"ambientAudioVolume"`
	AmbientAudioPositionMs     int64      `json:"ambientAudioPositionMs"`
	AmbientAudioStartedAt      *time.Time `json:"ambientAudioStartedAt"`
	AmbientAudioRevision       int64      `json:"ambientAudioRevision"`
	AmbientAudioLoop           bool       `json:"ambientAudioLoop"`
	AmbientEffectPath          *string    `json:"ambientEffectPath"`
	AmbientEffectEnabled       bool       `json:"ambientEffectEnabled"`
	AmbientEffectVolume        int        `json:"ambientEffectVolume"`
	AmbientEffectPositionMs    int64      `json:"ambientEffectPositionMs"`
	AmbientEffectStartedAt     *time.Time `json:"ambientEffectStartedAt"`
	AmbientEffectRevision      int64      `json:"ambientEffectRevision"`
	AmbientEffectLoop          bool       `json:"ambientEffectLoop"`
	GridSize                   int        `json:"gridSize"`
	MapWidthCells              int        `json:"mapWidthCells"`
	MapHeightCells             int        `json:"mapHeightCells"`
	PlayerAccess               string     `json:"playerAccess"`
	FogEnabled                 bool       `json:"fogEnabled"`
	VisionMode                 string     `json:"visionMode"`
	AllowPlayerMovement        bool       `json:"allowPlayerMovement"`
	AllowPlayerDoorInteraction bool       `json:"allowPlayerDoorInteraction"`
	EnforceTurnOrder           bool       `json:"enforceTurnOrder"`
}
type AudioChannelState struct {
	Path       *string `json:"path"`
	Playing    bool    `json:"playing"`
	Volume     float64 `json:"volume"`
	PositionMs int64   `json:"positionMs"`
	StartedAt  int64   `json:"startedAt"`
	Loop       bool    `json:"loop"`
	Revision   int64   `json:"revision"`
}
type CombatState struct {
	ActiveTokenID *string            `json:"activeTokenId"`
	Initiatives   []CombatInitiative `json:"initiatives"`
	Message       string             `json:"message,omitempty"`
}
type CombatInitiative struct {
	TokenID    string `json:"tokenId"`
	Initiative int    `json:"initiative"`
}

type

// InitiativeResult is the authoritative result of an individual initiative
// roll. The die is returned so the client can show the same result without
// performing a second, client-side random roll.
InitiativeResult struct {
	TokenID    string `json:"tokenId"`
	Roll       int    `json:"roll"`
	Rolls      []int  `json:"rolls"`
	Advantage  bool   `json:"advantage"`
	Bonus      int    `json:"bonus"`
	Initiative int    `json:"initiative"`
}
type FogState struct {
	VisibleCells  []string `json:"visibleCells"`
	RevealedCells []string `json:"revealedCells"`
	HiddenCells   []string `json:"hiddenCells"`
}
type Area struct {
	ID               string `json:"id"`
	Shape            string `json:"shape"`
	StartX           int    `json:"startX"`
	StartY           int    `json:"startY"`
	EndX             int    `json:"endX"`
	EndY             int    `json:"endY"`
	Color            int    `json:"color"`
	Label            string `json:"label"`
	VisibleToPlayers bool   `json:"visibleToPlayers"`
}

type

// Wall is a GM-only line segment. It participates in the server-side line of
// sight calculation, so a player cannot inspect the map geometry in DevTools.
Wall struct {
	ID     string `json:"id"`
	StartX int    `json:"startX"`
	StartY int    `json:"startY"`
	EndX   int    `json:"endX"`
	EndY   int    `json:"endY"`
	Kind   string `json:"kind"`
	Open   bool   `json:"open"`
}
type Effect struct {
	ID             string `json:"id"`
	TokenID        string `json:"tokenId"`
	Name           string `json:"name"`
	Source         string `json:"source"`
	RemainingTurns *int   `json:"remainingTurns"`
	TickAt         string `json:"tickAt"`
}

type

// EffectDefinition is a read-only entry from the SRD condition catalogue. It
// is intentionally separate from Effect: definitions are reusable rules,
// while effects are instances currently applied to a token in a scene.
EffectDefinition struct {
	Slug    string `json:"slug"`
	Name    string `json:"name"`
	Summary string `json:"summary"`
	Source  string `json:"source"`
}
type Token struct {
	ID      string  `json:"id"`
	ActorID *string `json:"actorId"`
	OwnerID *string `json:"-"`
	// IsOwner is deliberately a boolean instead of exposing OwnerID to browsers.
	// It lets a player open only the sheet tied to their own token.
	IsOwner             bool       `json:"isOwner"`
	Name                string     `json:"name"`
	ImageURL            *string    `json:"imageUrl"`
	Color               int        `json:"color"`
	X                   int        `json:"x"`
	Y                   int        `json:"y"`
	Size                int        `json:"size"`
	HPCurrent           int        `json:"hpCurrent"`
	HPMax               int        `json:"hpMax"`
	ArmorClass          int        `json:"armorClass"`
	Initiative          int        `json:"initiative"`
	InitiativeBonus     int        `json:"initiativeBonus"`
	InitiativeRolls     []int      `json:"initiativeRolls,omitempty"`
	InitiativeAdvantage bool       `json:"initiativeAdvantage,omitempty"`
	VisionRange         int        `json:"visionRange"`
	LightRange          int        `json:"lightRange"`
	MovementLimit       int        `json:"movementLimit"`
	MovementSpent       float64    `json:"movementSpent"`
	Statuses            []string   `json:"statuses"`
	Hidden              bool       `json:"hidden"`
	Visibility          Visibility `json:"visibility"`
}

type

// Visibility defines exactly which private attributes a non-owner player may receive.
// The server applies this policy before serialising the response; the browser never
// receives hidden HP, AC or conditions and therefore cannot reveal them locally.
Visibility struct {
	ShowName              bool    `json:"showName"`
	ShowHP                bool    `json:"showHP"`
	ShowAC                bool    `json:"showAC"`
	ShowStatuses          bool    `json:"showStatuses"`
	TransparentBackground bool    `json:"transparentBackground"`
	ImageScale            float64 `json:"imageScale"`
	ImageOffsetX          float64 `json:"imageOffsetX"`
	ImageOffsetY          float64 `json:"imageOffsetY"`
}
type Repository struct{ pool *pgxpool.Pool }
type Presentation struct {
	AssetPath          string   `json:"assetPath"`
	Title              string   `json:"title"`
	Description        string   `json:"description"`
	Visible            bool     `json:"visible"`
	VisibleUserIDs     []string `json:"visibleUserIds"`
	AudienceRestricted bool     `json:"audienceRestricted"`
	OverlayVisible     bool     `json:"overlayVisible"`
	UpdatedAt          string   `json:"updatedAt"`
}
type OverlaySettings struct {
	Enabled       bool            `json:"enabled"`
	Cameras       json.RawMessage `json:"cameras"`
	ActiveSceneID *string         `json:"activeSceneId"`
	CharacterIDs  []string        `json:"-"`
}

var ErrInvalidOverlayCharacter = errors.New("overlay character does not belong to campaign")
var playerTokenPalette = []int{
	0xD65A4A, 0x4E8FD0, 0x55A86B, 0xB276D2, 0xD49A3A, 0x3BA6A0,
	0xD06A9A, 0x7D8ED6, 0xA4A83B, 0x48A0A8, 0xE17B42, 0x8B6BC2,
}
var ErrForbidden = fmt.Errorf("forbidden")
var ErrTokenColorInUse = fmt.Errorf("token color already in use")
var ErrAlreadyLinked = fmt.Errorf("character already linked to scene")
var ErrBlockedMovement = fmt.Errorf("movement blocked by wall")
var ErrAudioRevisionConflict = fmt.Errorf("audio state revision conflict")
var ErrTokenNotFound = fmt.Errorf("token not found in scene")
