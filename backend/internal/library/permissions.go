package library

import (
	"encoding/json"
	"net/http"
	"strings"

	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
)

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
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return apperror.Internal(err)
		}
		userIDs = append(userIDs, id)
	}
	return write(w, http.StatusOK, map[string]any{"userIds": userIDs, "isGM": role == "gm"})
}

func (h *Handler) SavePermissions(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	campaignID := r.PathValue("campaignID")
	var in struct {
		ItemType string   `json:"itemType"`
		ItemKey  string   `json:"itemKey"`
		UserIDs  []string `json:"userIds"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&in); err != nil {
		return apperror.BadRequest("INVALID_BODY", "JSON inválido.")
	}
	in.ItemKey = strings.TrimSpace(in.ItemKey)
	if (in.ItemType != "asset" && in.ItemType != "note") || in.ItemKey == "" {
		return apperror.BadRequest("INVALID_ITEM", "Item inválido.")
	}
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
	for _, userID := range in.UserIDs {
		userID = strings.TrimSpace(userID)
		if userID == "" {
			continue
		}
		if _, err = tx.Exec(r.Context(), "insert into library_item_permissions(campaign_id,item_type,item_key,user_id) select $1,$2::public.library_item_type,$3,$4 where exists (select 1 from campaign_members where campaign_id=$1 and user_id=$4)", campaignID, in.ItemType, in.ItemKey, userID); err != nil {
			return apperror.Internal(err)
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		return apperror.Internal(err)
	}
	return h.ListPermissions(w, r)
}
