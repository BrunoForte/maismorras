package events

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
	"vtt-backend/internal/systems"
)

type Event struct {
	ID        int64           `json:"id"`
	Author    string          `json:"author"`
	Type      string          `json:"type"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt string          `json:"createdAt"`
}
type Handler struct{ pool *pgxpool.Pool }

var diceExpression = regexp.MustCompile(`^(\d{1,3})d(\d{1,4})(?:\+(\d{1,3})d(\d{1,4}))*(?:([+-])(\d{1,5}))?$`)
var diceTerm = regexp.MustCompile(`(\d{1,3})d(\d{1,4})`)
var fixedWeaponDamageExpression = regexp.MustCompile(`^[+-]?\d{1,5}$`)

type diceGroup struct{ count, sides int }

func parseDiceExpression(expression string) ([]diceGroup, int, error) {
	compact := strings.ReplaceAll(strings.TrimSpace(expression), " ", "")
	if !diceExpression.MatchString(compact) {
		return nil, 0, fmt.Errorf("invalid expression")
	}
	groups := make([]diceGroup, 0, 4)
	totalDice := 0
	for _, match := range diceTerm.FindAllStringSubmatch(compact, -1) {
		count, _ := strconv.Atoi(match[1])
		sides, _ := strconv.Atoi(match[2])
		if count < 1 || sides < 2 || sides > 1000 {
			return nil, 0, fmt.Errorf("outside limits")
		}
		totalDice += count
		if totalDice > 100 {
			return nil, 0, fmt.Errorf("outside limits")
		}
		groups = append(groups, diceGroup{count, sides})
	}
	modifier := 0
	if last := compact[len(compact)-1:]; last != "d" {
		if match := regexp.MustCompile(`([+-])(\d+)$`).FindStringSubmatch(compact); match != nil {
			modifier, _ = strconv.Atoi(match[2])
			if match[1] == "-" {
				modifier = -modifier
			}
		}
	}
	if modifier < -10000 || modifier > 10000 {
		return nil, 0, fmt.Errorf("outside limits")
	}
	return groups, modifier, nil
}

type DiceResult struct {
	Expression   string `json:"expressao"`
	Dice         []int  `json:"dados"`
	OriginalDice []int  `json:"dadosOriginais,omitempty"`
	Mode         string `json:"modo,omitempty"`
	Kept         int    `json:"dadoEscolhido,omitempty"`
	Modifier     int    `json:"modificador"`
	Total        int    `json:"total"`
	Channel      string `json:"channel,omitempty"`
	RuleApplied  string `json:"regraAplicada,omitempty"`
}

func NewHandler(pool *pgxpool.Pool) *Handler { return &Handler{pool: pool} }
func (h *Handler) List(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	campaignID := r.PathValue("campaignID")
	afterID := int64(0)
	if raw := strings.TrimSpace(r.URL.Query().Get("after")); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || parsed < 0 {
			return apperror.BadRequest("INVALID_CURSOR", "Cursor de eventos inválido.")
		}
		afterID = parsed
	}
	var role string
	if err := h.pool.QueryRow(r.Context(), `select role::text from campaign_members where campaign_id=$1 and user_id=$2`, campaignID, p.UserID).Scan(&role); err != nil {
		return apperror.Forbidden("Você não participa desta campanha.")
	}
	query := `select e.id,coalesce(pr.display_name,'Mesa'),e.event_type,e.payload,e.created_at::text from game_events e left join profiles pr on pr.id=e.actor_id where e.campaign_id=$1 and e.event_type in ('chat.message','dice.roll','system.info')`
	// Combat logs currently contain the private token name. Until combat events
	// carry per-token visibility metadata, do not send them to players at all.
	// This conservative server-side rule prevents a hidden enemy leaking via chat.
	if role == "gm" {
		query = `select e.id,coalesce(pr.display_name,'Mesa'),e.event_type,e.payload,e.created_at::text from game_events e left join profiles pr on pr.id=e.actor_id where e.campaign_id=$1 and e.event_type in ('chat.message','dice.roll','combat.log','system.info')`
	}
	if p.OverlayOnly {
		query = `select e.id,coalesce(pr.display_name,'Mesa'),e.event_type,e.payload,e.created_at::text from game_events e left join profiles pr on pr.id=e.actor_id where e.campaign_id=$1 and e.event_type='dice.roll'`
	}
	args := []any{campaignID}
	if afterID > 0 {
		query += ` and e.id > $2`
		args = append(args, afterID)
		query += ` order by e.id asc limit 100`
	} else {
		query += ` order by e.id desc limit 100`
	}
	rows, err := h.pool.Query(r.Context(), query, args...)
	if err != nil {
		return apperror.Internal(err)
	}
	defer rows.Close()
	items := []Event{}
	for rows.Next() {
		var item Event
		if err := rows.Scan(&item.ID, &item.Author, &item.Type, &item.Payload, &item.CreatedAt); err != nil {
			return apperror.Internal(err)
		}
		items = append(items, item)
	}
	if afterID == 0 {
		for left, right := 0, len(items)-1; left < right; left, right = left+1, right-1 {
			items[left], items[right] = items[right], items[left]
		}
	}
	return write(w, http.StatusOK, map[string]any{"events": items})
}
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	campaignID := r.PathValue("campaignID")
	var in struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&in); err != nil {
		return apperror.BadRequest("INVALID_BODY", "JSON inválido.")
	}
	if in.Type != "chat.message" && in.Type != "dice.roll" {
		return apperror.BadRequest("INVALID_EVENT", "Evento inválido.")
	}
	if len(in.Payload) == 0 || !json.Valid(in.Payload) {
		return apperror.BadRequest("INVALID_EVENT", "Conteúdo inválido.")
	}
	var exists bool
	if err := h.pool.QueryRow(r.Context(), `select exists(select 1 from campaign_members where campaign_id=$1 and user_id=$2)`, campaignID, p.UserID).Scan(&exists); err != nil || !exists {
		return apperror.Forbidden("Você não participa desta campanha.")
	}
	if in.Type == "chat.message" {
		var payload struct {
			Text string `json:"text"`
		}
		_ = json.Unmarshal(in.Payload, &payload)
		if len([]rune(strings.TrimSpace(payload.Text))) == 0 || len([]rune(payload.Text)) > 2000 {
			return apperror.BadRequest("INVALID_MESSAGE", "A mensagem deve ter entre 1 e 2000 caracteres.")
		}
	} else {
		var payload struct {
			Expression       string `json:"expression"`
			Mode             string `json:"mode"`
			Channel          string `json:"channel"`
			MinimumDamageDie int    `json:"minimumDamageDie"`
			WeaponDamage     bool   `json:"weaponDamage"`
			Critical         bool   `json:"critical"`
		}
		if err := json.Unmarshal(in.Payload, &payload); err != nil {
			return apperror.BadRequest("INVALID_ROLL", "Rolagem inválida.")
		}
		if payload.Mode != "" && payload.Mode != "disadvantage" && payload.Mode != "advantage" {
			return apperror.BadRequest("INVALID_ROLL", "Modo de rolagem inválido.")
		}
		if payload.Channel != "" && payload.Channel != "chat" && payload.Channel != "combat" {
			return apperror.BadRequest("INVALID_ROLL", "Canal de rolagem inválido.")
		}
		if payload.MinimumDamageDie != 0 && (payload.MinimumDamageDie != 3 || payload.Channel != "combat" || payload.Mode != "" || !validMinimumDamageRoll(payload.Expression)) {
			return apperror.BadRequest("INVALID_ROLL", "Regra de dano inválida para esta rolagem.")
		}
		if payload.Critical && !payload.WeaponDamage {
			return apperror.BadRequest("INVALID_ROLL", "Crítico inválido para esta rolagem.")
		}
		if payload.WeaponDamage && (payload.Channel != "combat" || payload.Mode != "" || !validWeaponDamageRoll(payload.Expression)) {
			return apperror.BadRequest("INVALID_ROLL", "A rolagem de dano da arma excede os limites permitidos.")
		}
		expression := strings.TrimSpace(payload.Expression)
		var result DiceResult
		var err error
		if payload.WeaponDamage {
			result, err = rollWeaponDamageExpression(expression, payload.Critical)
		} else if payload.Mode != "" {
			var systemID, systemVersion string
			if err := h.pool.QueryRow(r.Context(), `select system_id,system_version from campaigns where id=$1`, campaignID).Scan(&systemID, &systemVersion); err != nil {
				return apperror.Internal(err)
			}
			rules, ok := systems.ResolveDnd2024CharacterRules(systems.Ref{ID: systems.ID(systemID), Version: systems.Version(systemVersion)})
			if !ok {
				return apperror.BadRequest("UNSUPPORTED_SYSTEM", "O sistema desta campanha não oferece esse modo de rolagem.")
			}
			result, err = rollWithMode(expression, payload.Mode, rules, secureDiceRoll)
		} else {
			result, err = roll(expression)
		}
		if err != nil {
			return apperror.BadRequest("INVALID_ROLL", "Use uma expressão como 1d20+5.")
		}
		if payload.MinimumDamageDie == 3 {
			result = applyMinimumDamageDie(result, 3)
		}
		result.Channel = payload.Channel
		in.Payload, _ = json.Marshal(result)
	}
	var item Event
	err := h.pool.QueryRow(r.Context(), `insert into game_events(campaign_id,actor_id,event_type,payload) values($1,$2,$3,$4) returning id,event_type,payload,created_at::text`, campaignID, p.UserID, in.Type, in.Payload).Scan(&item.ID, &item.Type, &item.Payload, &item.CreatedAt)
	if err != nil {
		return apperror.Internal(err)
	}
	_ = h.pool.QueryRow(r.Context(), `select display_name from profiles where id=$1`, p.UserID).Scan(&item.Author)
	return write(w, http.StatusCreated, item)
}

func validWeaponDamageRoll(expression string) bool {
	groups, _, err := parseDiceExpression(expression)
	if err != nil || len(groups) == 0 {
		_, fixedOnly := fixedWeaponDamageResult(expression)
		return fixedOnly
	}
	total := 0
	for _, group := range groups {
		total += group.count
	}
	return total <= 10
}

func fixedWeaponDamageResult(expression string) (DiceResult, bool) {
	compact := strings.ReplaceAll(strings.TrimSpace(expression), " ", "")
	if !fixedWeaponDamageExpression.MatchString(compact) {
		return DiceResult{}, false
	}
	modifier, err := strconv.Atoi(compact)
	if err != nil || modifier < -10000 || modifier > 10000 {
		return DiceResult{}, false
	}
	return DiceResult{
		Expression: compact,
		Dice:       []int{},
		Modifier:   modifier,
		Total:      modifier,
	}, true
}

func rollWeaponDamageExpression(expression string, critical bool) (DiceResult, error) {
	if fixedResult, fixedOnly := fixedWeaponDamageResult(expression); fixedOnly {
		// Critical hits double rolled dice only. A fixed damage value remains once.
		return fixedResult, nil
	}
	if critical {
		var err error
		expression, err = doubleDiceExpression(expression)
		if err != nil {
			return DiceResult{}, err
		}
	}
	return roll(expression)
}

func doubleDiceExpression(expression string) (string, error) {
	groups, modifier, err := parseDiceExpression(expression)
	if err != nil {
		return "", err
	}
	parts := make([]string, 0, len(groups)+1)
	for _, group := range groups {
		parts = append(parts, fmt.Sprintf("%dd%d", group.count*2, group.sides))
	}
	result := strings.Join(parts, "+")
	if modifier != 0 {
		result += fmt.Sprintf("%+d", modifier)
	}
	return result, nil
}

func validMinimumDamageRoll(expression string) bool {
	groups, _, err := parseDiceExpression(expression)
	if err != nil || len(groups) == 0 {
		return false
	}
	for _, group := range groups {
		switch group.sides {
		case 4, 6, 8, 10, 12:
		default:
			return false
		}
	}
	return true
}

func applyMinimumDamageDie(result DiceResult, minimum int) DiceResult {
	if minimum < 2 || len(result.Dice) == 0 {
		return result
	}
	adjusted := append([]int(nil), result.Dice...)
	changed := false
	for index, face := range adjusted {
		if face < minimum {
			result.Total += minimum - face
			adjusted[index] = minimum
			changed = true
		}
	}
	if changed {
		result.OriginalDice = append([]int(nil), result.Dice...)
		result.Dice = adjusted
		result.RuleApplied = "Great Weapon Fighting: resultados 1 e 2 tratados como 3"
	}
	return result
}

// roll uses crypto/rand, never browser-provided values. The client requests an
// expression only; the exact dice faces and total are generated by the API and
// become the immutable event stored in PostgreSQL.
func roll(expression string) (DiceResult, error) {
	groups, modifier, err := parseDiceExpression(expression)
	if err != nil {
		return DiceResult{}, err
	}
	capacity := 0
	for _, group := range groups {
		capacity += group.count
	}
	result := DiceResult{Expression: expression, Dice: make([]int, 0, capacity), Modifier: modifier}
	for _, group := range groups {
		for range group.count {
			n, err := rand.Int(rand.Reader, big.NewInt(int64(group.sides)))
			if err != nil {
				return DiceResult{}, err
			}
			value := int(n.Int64()) + 1
			result.Dice = append(result.Dice, value)
			result.Total += value
		}
	}
	result.Total += modifier
	return result, nil
}

// rollWithMode delegates d20 semantics to the selected campaign's registered
// rules. Only its roller callback creates faces, so clients cannot submit outcomes.
func rollWithMode(expression, mode string, rules systems.Dnd2024CharacterRules, roller systems.DiceRoller) (DiceResult, error) {
	if rules == nil || (mode != "normal" && mode != "advantage" && mode != "disadvantage") {
		return DiceResult{}, fmt.Errorf("unsupported d20 mode")
	}
	groups, _, parseErr := parseDiceExpression(expression)
	if parseErr != nil || len(groups) != 1 || groups[0].count != 1 || groups[0].sides != 20 {
		return DiceResult{}, fmt.Errorf("mode requires 1d20")
	}
	_, modifier, _ := parseDiceExpression(expression)
	result, err := rules.RollD20(systems.D20Mode(mode), modifier, roller)
	if err != nil {
		return DiceResult{}, err
	}
	localizedMode := map[string]string{"advantage": "vantagem", "disadvantage": "desvantagem"}[mode]
	displayExpression := expression
	if mode != "normal" {
		displayExpression = fmt.Sprintf("%s (%s: %s)", expression, localizedMode, joinInts(result.Rolls))
	}
	kept := DiceResult{
		Expression: displayExpression,
		Dice:       []int{result.Kept},
		OriginalDice: func() []int {
			if len(result.Rolls) < 2 {
				return nil
			}
			return append([]int(nil), result.Rolls...)
		}(),
		Mode:     mode,
		Kept:     result.Kept,
		Modifier: modifier,
		Total:    result.Total,
	}
	return kept, nil
}

func secureDiceRoll(sides int) (int, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(int64(sides)))
	if err != nil {
		return 0, err
	}
	return int(n.Int64()) + 1, nil
}

func joinInts(values []int) string {
	parts := make([]string, len(values))
	for i, value := range values {
		parts[i] = strconv.Itoa(value)
	}
	return strings.Join(parts, "/")
}
func write(w http.ResponseWriter, status int, v any) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(v)
}
