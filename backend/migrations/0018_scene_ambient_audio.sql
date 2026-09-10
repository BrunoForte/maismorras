-- Trilha opcional da cena. Armazenamos a chave privada do Storage, nunca uma
-- signed URL temporária; cada cliente gera sua própria URL de reprodução.
alter table public.scenes
  add column if not exists ambient_audio_path text,
  add column if not exists ambient_audio_enabled boolean not null default false,
  add column if not exists ambient_audio_volume integer not null default 65
    check (ambient_audio_volume between 0 and 100);
