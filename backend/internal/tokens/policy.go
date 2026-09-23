package tokens

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresGenerationPolicy keeps quotas consistent across Cloud Run instances
// and authorizes map generation against the campaign's current GM membership.
type PostgresGenerationPolicy struct{ pool *pgxpool.Pool }

func NewPostgresGenerationPolicy(pool *pgxpool.Pool) *PostgresGenerationPolicy {
	return &PostgresGenerationPolicy{pool: pool}
}

func (p *PostgresGenerationPolicy) CanGenerateMap(ctx context.Context, campaignID, userID string, isAdmin bool) (bool, error) {
	var allowed bool
	err := p.pool.QueryRow(ctx, `select $3::boolean or exists (
		select 1 from public.campaigns c
		where c.id::text=$1 and (
			c.owner_id::text=$2
			or exists (select 1 from public.campaign_members m where m.campaign_id=c.id and m.user_id::text=$2 and m.role='gm'::public.campaign_role)
		)
	)`, campaignID, userID, isAdmin).Scan(&allowed)
	return allowed, err
}

func (p *PostgresGenerationPolicy) Consume(ctx context.Context, userID, operation string, limit int) (bool, error) {
	if operation != "portrait" && operation != "map" || limit < 1 || limit > 100 {
		return false, errors.New("invalid image generation quota request")
	}
	var count int
	err := p.pool.QueryRow(ctx, `insert into private.image_generation_limits(user_id,operation,window_started_at,request_count)
		values($1,$2,date_trunc('minute',clock_timestamp()),1)
		on conflict(user_id,operation) do update set
			window_started_at=case when image_generation_limits.window_started_at <= clock_timestamp()-interval '1 minute' then date_trunc('minute',clock_timestamp()) else image_generation_limits.window_started_at end,
			request_count=case when image_generation_limits.window_started_at <= clock_timestamp()-interval '1 minute' then 1 else image_generation_limits.request_count+1 end,
			updated_at=clock_timestamp()
		where private.image_generation_limits.window_started_at <= clock_timestamp()-interval '1 minute'
			or private.image_generation_limits.request_count < $3
		returning request_count`, userID, operation, limit).Scan(&count)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}
