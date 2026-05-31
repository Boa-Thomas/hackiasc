-- ============================================================
-- SCHEDULE — expor o ponteiro da facilitadora ao participante
-- ============================================================
-- O painel do participante passa a destacar "onde estamos agora" no
-- cronograma. A fonte de verdade e o ponteiro da facilitadora (aba
-- Facilitador), que marca blocos como feitos ao vivo (schedule_items.done).
--
-- A versao original de get_public_schedule() OMITIA `done` de proposito
-- ("interno da facilitadora"). Esta migracao reverte essa decisao de forma
-- DELIBERADA e ESCOPADA: passamos a expor APENAS o booleano `done` por item
-- (necessario para o cliente derivar feito/atual/futuro). `done_at`
-- permanece interno — nunca e exposto a anon.
--
-- Mudanca puramente ADITIVA: o Timeline da landing ignora campos extras, e o
-- contrato (dias ordenados, itens ordenados) nao muda. RLS/grants inalterados.

CREATE OR REPLACE FUNCTION get_public_schedule()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(json_agg(d ORDER BY d.sort_order), '[]'::json)
  FROM (
    SELECT
      sd.day_key,
      sd.label,
      sd.time_window AS window,
      sd.note,
      sd.accent,
      sd.sort_order,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'time', si.time,
              'title', si.title,
              'description', si.description,
              'done', si.done
            )
            ORDER BY si.sort_order
          )
          FROM schedule_items si
          WHERE si.day_key = sd.day_key
        ),
        '[]'::json
      ) AS items
    FROM schedule_days sd
  ) d;
$$;

GRANT EXECUTE ON FUNCTION get_public_schedule() TO anon;
