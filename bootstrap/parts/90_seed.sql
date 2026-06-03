-- Structural singletons the app code reads/updates by fixed id (non-upserting).
-- Neutral initial values only — NO event data.
INSERT INTO public.mp_sync_status (id, is_syncing) VALUES (1, false) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.wall_state (id, phase) VALUES (true, 'closed') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.slides_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
