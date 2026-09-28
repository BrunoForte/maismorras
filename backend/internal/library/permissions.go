package library

import (
	"encoding/json"
	"net/http"
	"strings"

	"vtt-backend/internal/apperror"
	"vtt-backend/internal/audience"
	"vtt-backend/internal/auth"
)

func normalizePermissionSelection(restricted *bool, userIDs []string) (bool, []string) {
	if restricted == nil {
		legacyRestricted := len(userIDs) > 0
		restricted = &legacyRestricted
	}
	if !*restricted {
		return false, nil
	}
	return true, userIDs
}

func permissionPolicy(restricted bool, userIDs []string) audience.Policy {
	if !restricted {
		return audience.Policy{Mode: audience.ModeAll}
	}
	if len(userIDs) == 0 {
		return audience.Policy{Mode: audience.ModeNone}
	}
	return audience.Policy{Mode: audience.ModeSelected, UserIDs: userIDs}
}

func permissionResponse(gmID string, userIDs []string, restricted bool) map[string]any {
	players := make([]string, 0, len(userIDs))
	for _, userID := range userIDs {
		if userID != gmID {
			players = append(players, userID)
		}
	}
	return map[string]any{"userIds": players, "isGM": true, "restricted": restricted}
}

func (h *Handler) ListPermissions(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	campaignID := r.PathValue("campaignID")
	itemType := strings.TrimSpace(r.URL.Query().Get("itemType"))
	itemKey := strings.TrimSpace(r.URL.Query().Get("itemKey"))
	if (itemType != "asset" && itemType != "note") || itemKey == "" {
		return apperror.BadRequest("INVALID_ITEM", "Item inválido.")
	}
	var role string
	if err := h.pool.QueryRow(r.Context(), "select role::text from campaign_members where campaign_id=$1 and user_id=$2", campaignID, p.UserID).Scan(&role); err != nil || role != "gm" {
		return apperror.Forbidden("Somente o narrador pode consultar permissões.")
	}
	rows, err := h.pool.Query(r.Context(), "select user_id::text from library_item_permissions where campaign_id=$1 and item_type=$2::public.library_item_type and item_key=$3 order by user_id", campaignID, itemType, itemKey)
	if err != nil {
		return apperror.Internal(err)
	}
	defer rows.Close()
	userIDs := []string{}
	restricted := false
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return apperror.Internal(err)
		}
		restricted = true
		if id != p.UserID {
			userIDs = append(userIDs, id)
		}
	}
	return write(w, http.StatusOK, map[string]any{"userIds": userIDs, "isGM": role == "gm", "restricted": restricted})
}

func (h *Handler) SavePermissions(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	campaignID := r.PathValue("campaignID")
	var in struct {
		ItemType   string   `json:"itemType"`
		ItemKey    string   `json:"itemKey"`
		UserIDs    []string `json:"userIds"`
		Restricted *bool    `json:"restricted"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&in); err != nil {
		return apperror.BadRequest("INVALID_BODY", "JSON inválido.")
	}
	in.ItemKey = strings.TrimSpace(in.ItemKey)
	if (in.ItemType != "asset" && in.ItemType != "note") || in.ItemKey == "" {
		return apperror.BadRequest("INVALID_ITEM", "Item inválido.")
	}
	if len(in.UserIDs) > 100 {
		return apperror.BadRequest("INVALID_PERMISSIONS", "Selecione no máximo 100 jogadores.")
	}
	// Older clients omitted `restricted`; their non-empty user list meant an
	// allowlist. New clients can explicitly select all players while retaining
	// stale local checkboxes, so an explicit false must ignore that list.
	restricted, userIDs := normalizePermissionSelection(in.Restricted, in.UserIDs)
	in.UserIDs = userIDs
	var role string
	if err := h.pool.QueryRow(r.Context(), "select role::text from campaign_members where campaign_id=$1 and user_id=$2", campaignID, p.UserID).Scan(&role); err != nil || role != "gm" {
		return apperror.Forbidden("Somente o narrador pode alterar permissões.")
	}
	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		return apperror.Internal(err)
	}
	defer tx.Rollback(r.Context())
	if _, err = tx.Exec(r.Context(), "delete from library_item_permissions where campaign_id=$1 and item_type=$2::public.library_item_type and item_key=$3", campaignID, in.ItemType, in.ItemKey); err != nil {
		return apperror.Internal(err)
	}
	if restricted {
		// The GM row is a sentinel that distinguishes “selected list is empty”
		// (nobody) from no permission rows (all campaign players).
		if _, err = tx.Exec(r.Context(), "insert into library_item_permissions(campaign_id,item_type,item_key,user_id) values($1,$2::public.library_item_type,$3,$4)", campaignID, in.ItemType, in.ItemKey, p.UserID); err != nil {
			return apperror.Internal(err)
		}
	}
	seen := make(map[string]struct{}, len(in.UserIDs))
	selected := make([]string, 0, len(in.UserIDs))
	for _, userID := range in.UserIDs {
		userID = strings.TrimSpace(userID)
		if userID == "" {
			continue
		}
		if _, ok := seen[userID]; ok {
			continue
		}
		seen[userID] = struct{}{}
		selected = append(selected, userID)
	}
	if len(selected) > 0 {
		var validCount int
		if err = tx.QueryRow(r.Context(), `select count(distinct selected.id) from unnest($2::uuid[]) selected(id) join campaign_members m on m.campaign_id=$1 and m.user_id=selected.id and m.role='player'::public.campaign_role`, campaignID, selected).Scan(&validCount); err != nil {
			return apperror.Internal(err)
		}
		if validCount != len(selected) {
			return apperror.BadRequest("INVALID_PERMISSION_MEMBER", "A lista contém alguém que não é jogador desta mesa.")
		}
	}
	policy := permissionPolicy(restricted, selected)
	if policy.Mode == audience.ModeSelected {
		if _, err = tx.Exec(r.Context(), `insert into library_item_permissions(campaign_id,item_type,item_key,user_id) select $1,$2::public.library_item_type,$3,selected.id from unnest($4::uuid[]) selected(id)`, campaignID, in.ItemType, in.ItemKey, policy.UserIDs); err != nil {
			return apperror.Internal(err)
		}
	}
	if in.ItemType == "note" {
		result, updateErr := tx.Exec(r.Context(), "update public.notes set visibility='players'::public.note_visibility, updated_at=now() where id::text=$1 and campaign_id=$2", in.ItemKey, campaignID)
		if updateErr != nil {
			return apperror.Internal(updateErr)
		}
		if result.RowsAffected() != 1 {
			return apperror.BadRequest("INVALID_ITEM", "Handout não encontrado nesta campanha.")
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		return apperror.Internal(err)
	}
	// Do not call ListPermissions here: PUT requests do not carry its required
	// itemType/itemKey query parameters. That used to commit successfully and
	// then incorrectly return INVALID_ITEM (400) to the client.
	return write(w, http.StatusOK, permissionResponse(p.UserID, selected, restricted))
}
