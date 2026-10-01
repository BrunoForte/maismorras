-- Playback loop is a per-scene, per-channel choice. File metadata remains the
-- initial suggestion only; narrators can override it independently per scene.
alter table public.scenes
  add column if not exists ambient_audio_loop boolean not null default true,
  add column if not exists ambient_effect_loop boolean not null default false;
