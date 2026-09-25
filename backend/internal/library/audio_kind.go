package library

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"path"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
)

var audioUUIDPrefix = regexp.MustCompile(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-)(.*)$`)

func configuredAudioPath(campaignID, assetPath, kind string, looping bool) (string, error) {
	prefix := "campaigns/" + campaignID + "/media/"
	if kind != "music" && kind != "effect" || !strings.HasPrefix(assetPath, prefix) || strings.Contains(assetPath, "..") || path.IsAbs(assetPath) {
		return "", errInvalidAudioAsset
	}
	name := strings.TrimPrefix(assetPath, prefix)
	if name == "" || strings.Contains(name, "/") || !isAudioPath(name) {
		return "", errInvalidAudioAsset
	}
	unique := ""
	if match := audioUUIDPrefix.FindStringSubmatch(name); match != nil {
		unique, name = match[1], match[2]
	}
	for _, previous := range []string{"effect_loop__", "effect_once__", "music_loop__", "music_once__", "effect__", "sfx__", "music__"} {
		name = strings.TrimPrefix(name, previous)
	}
	if name == "" {
		return "", errInvalidAudioAsset
	}
	loopMode := "once"
	if looping {
		loopMode = "loop"
	}
	return prefix + unique + kind + "_" + loopMode + "__" + name, nil
}

var errInvalidAudioAsset = &invalidAudioAssetError{}

type invalidAudioAssetError struct{}

func (*invalidAudioAssetError) Error() string { return "invalid campaign audio asset" }

type changedAudioScene struct {
	id         string
	path       string
	playing    bool
	volume     float64
	positionMs int64
	startedAt  int64
	revision   int64
	effects    bool
}

// SetAudioKind moves an audio object to a kind-tagged immutable path. It also
// rewrites persisted scene references and broadcasts the new path to connected
// clients, so categorizing an existing upload does not break active playback.
func (h *Handler) SetAudioKind(w http.ResponseWriter, r *http.Request) error {
	p, _ := auth.FromContext(r.Context())
	campaignID := r.PathValue("campaignID")
	var in struct {
		Path    string `json:"path"`
		Kind    string `json:"kind"`
		Looping *bool  `json:"looping"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&in); err != nil {
		return apperror.BadRequest("INVALID_BODY", "JSON inválido.")
	}
	in.Path = strings.TrimSpace(in.Path)
	looping := in.Kind == "music"
	if in.Looping != nil {
		looping = *in.Looping
	}
	destination, err := configuredAudioPath(campaignID, in.Path, in.Kind, looping)
	if err != nil {
		return apperror.BadRequest("INVALID_AUDIO_ASSET", "Selecione um áudio desta campanha e um tipo válido.")
	}
	var isGM bool
	if err := h.pool.QueryRow(r.Context(), `select exists(select 1 from campaign_members where campaign_id=$1 and user_id=$2 and role='gm'::public.campaign_role)`, campaignID, p.UserID).Scan(&isGM); err != nil {
		return apperror.Internal(err)
	}
	if !isGM {
		return apperror.Forbidden("Somente o narrador pode alterar o tipo de áudio.")
	}
	if destination == in.Path {
		return write(w, http.StatusOK, map[string]any{"path": destination, "kind": in.Kind, "looping": looping})
	}
	if h.cfg.SupabaseURL == "" || h.cfg.SupabaseSecretKey == "" {
		return apperror.ServiceUnavailable("Storage seguro não está configurado no servidor.")
	}
	if err := h.moveStorageObject(r.Context(), in.Path, destination); err != nil {
		if err == errStorageObjectMissing {
			return apperror.NotFound("ASSET_NOT_FOUND", "Este áudio não existe mais no Storage.")
		}
		return apperror.Internal(err)
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		h.compensateAudioMove(r, destination, in.Path)
		return apperror.Internal(err)
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	if _, err = tx.Exec(r.Context(), `update public.library_item_permissions set item_key=$1 where campaign_id=$2 and item_type='asset'::public.library_item_type and item_key=$3 and not exists(select 1 from public.library_item_permissions p where p.campaign_id=$2 and p.item_type='asset'::public.library_item_type and p.item_key=$1 and p.user_id=library_item_permissions.user_id)`, destination, campaignID, in.Path); err == nil {
		_, err = tx.Exec(r.Context(), `delete from public.library_item_permissions old where old.campaign_id=$1 and old.item_type='asset'::public.library_item_type and old.item_key=$2 and exists(select 1 from public.library_item_permissions current where current.campaign_id=$1 and current.item_type='asset'::public.library_item_type and current.item_key=$3 and current.user_id=old.user_id)`, campaignID, in.Path, destination)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `update public.campaign_assets set path=$1 where campaign_id=$2 and path=$3`, destination, campaignID, in.Path)
	}
	changed := make([]changedAudioScene, 0, 2)
	if err == nil {
		changed, err = updateAudioSceneReferences(r.Context(), tx, campaignID, in.Path, destination)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `update public.scene_presentations set asset_path=$1,updated_at=now() where campaign_id=$2 and asset_path=$3`, destination, campaignID, in.Path)
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		_ = tx.Rollback(r.Context())
		h.compensateAudioMove(r, destination, in.Path)
		return apperror.Internal(err)
	}
	if h.audio != nil {
		for _, state := range changed {
			h.audio.BroadcastAudioState(state.id, state.path, state.playing, state.volume, state.positionMs, state.startedAt, state.revision, state.effects)
		}
	}
	return write(w, http.StatusOK, map[string]any{"path": destination, "kind": in.Kind, "looping": looping})
}

var errStorageObjectMissing = &storageObjectMissingError{}

type storageObjectMissingError struct{}

func (*storageObjectMissingError) Error() string { return "storage object not found" }

func (h *Handler) moveStorageObject(ctx context.Context, source, destination string) error {
	body, _ := json.Marshal(map[string]string{"bucketId": "campaign-assets", "sourceKey": source, "destinationKey": destination})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.cfg.SupabaseURL+"/storage/v1/object/move", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+h.cfg.SupabaseSecretKey)
	req.Header.Set("apikey", h.cfg.SupabaseSecretKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := h.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 == 2 {
		return nil
	}
	if resp.StatusCode == http.StatusNotFound {
		return errStorageObjectMissing
	}
	// Never include an upstream Storage response body in application errors.
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4<<10))
	return &storageMoveError{status: resp.StatusCode}
}

type storageMoveError struct{ status int }

func (e *storageMoveError) Error() string {
	return "storage move failed with status " + http.StatusText(e.status)
}

func (h *Handler) compensateAudioMove(r *http.Request, source, destination string) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if err := h.moveStorageObject(ctx, source, destination); err != nil {
		slog.Error("audio asset move compensation failed", "request_id", r.Header.Get("X-Request-ID"), "campaign_id", r.PathValue("campaignID"), "error", err)
	}
}

func updateAudioSceneReferences(ctx context.Context, tx pgx.Tx, campaignID, oldPath, newPath string) ([]changedAudioScene, error) {
	changed := make([]changedAudioScene, 0, 2)
	for _, effect := range []bool{false, true} {
		column := "ambient_audio"
		if effect {
			column = "ambient_effect"
		}
		query := `update public.scenes set ` + column + `_path=$3,` + column + `_revision=` + column + `_revision+1,updated_at=now() where campaign_id=$1 and ` + column + `_path=$2 returning id::text,` + column + `_path,` + column + `_enabled,` + column + `_volume::double precision/100,` + column + `_position_ms,coalesce((extract(epoch from ` + column + `_started_at)*1000)::bigint,0),` + column + `_revision`
		rows, err := tx.Query(ctx, query, campaignID, oldPath, newPath)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			state := changedAudioScene{effects: effect}
			if err := rows.Scan(&state.id, &state.path, &state.playing, &state.volume, &state.positionMs, &state.startedAt, &state.revision); err != nil {
				rows.Close()
				return nil, err
			}
			changed = append(changed, state)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}
	return changed, nil
}
