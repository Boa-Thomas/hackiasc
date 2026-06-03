-- SP2/B3 precondition: re-key event_eval_resolve's MENTOR branch to session-first
-- (current_mentor_id() then the legacy mentor_sessions/access_token lookup), so a
-- session mentor (B2) can do the event-evaluation survey. The participant branch is
-- unchanged (participants are not migrated to sessions). Juror has no event_eval.
-- get_my_event_evaluation / submit_event_evaluation call this resolver.
-- Additive/coexistent (legacy token still resolves); closes the last mentor/juror
-- token-RPC gap from the exhaustive sweep, so the B3 cutoff can safely remove the
-- legacy token paths. Signature unchanged (p_token uuid; session passes null).
CREATE OR REPLACE FUNCTION public.event_eval_resolve(p_token uuid, p_type text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id UUID;
BEGIN
  IF p_type = 'participant' THEN
    BEGIN
      v_id := participant_session_owner(p_token);
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    IF v_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM registrations WHERE id = v_id AND payment_status = 'confirmed'
    ) THEN
      RETURN NULL;
    END IF;
    RETURN v_id;
  ELSIF p_type = 'mentor' THEN
    v_id := current_mentor_id();
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    IF p_token IS NOT NULL THEN
      SELECT mentor_id INTO v_id FROM mentor_sessions
        WHERE token = p_token AND expires_at > now();
      IF v_id IS NULL THEN
        SELECT id INTO v_id FROM mentors WHERE access_token = p_token;
      END IF;
    END IF;
    RETURN v_id;
  END IF;
  RETURN NULL;
END;
$function$;
