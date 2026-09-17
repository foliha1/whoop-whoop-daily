-- The five-group cap must be reported before the daily create ceiling, or a
-- player at the cap is told "too many tries" when the truth is "you are in five
-- groups already".
CREATE OR REPLACE FUNCTION public.create_daily_group(p_name text, p_visitor_id text, p_display_name text)
 RETURNS TABLE(group_id uuid, name text, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_max_groups constant integer := 5;
  c_per_visitor_per_day constant integer := 10;
  v_visitor text := left(btrim(coalesce(p_visitor_id, '')), 100);
  v_name text := left(btrim(coalesce(p_name, '')), 24);
  v_dn text := left(btrim(coalesce(p_display_name, '')), 6);
  v_email text := nullif(lower(btrim(coalesce(auth.jwt() ->> 'email', ''))), '');
  v_code text;
  v_id uuid;
  v_try integer := 0;
BEGIN
  IF length(v_visitor) = 0 OR length(v_name) = 0 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  IF length(v_dn) = 0 THEN v_dn := 'Player'; END IF;

  IF (SELECT count(*) FROM public.daily_group_members m WHERE m.visitor_id = v_visitor)
     >= c_max_groups THEN
    RAISE EXCEPTION 'group_limit_reached';
  END IF;

  IF NOT public.rl_hit('daily_group_create', v_visitor, c_per_visitor_per_day) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  LOOP
    v_try := v_try + 1;
    v_code := public.gen_daily_group_code();
    BEGIN
      INSERT INTO public.daily_groups (code, name, created_by)
      VALUES (v_code, v_name, v_visitor)
      RETURNING public.daily_groups.id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_try >= 20 THEN RAISE EXCEPTION 'code_generation_failed'; END IF;
    END;
  END LOOP;

  INSERT INTO public.daily_group_members (group_id, visitor_id, display_name, email, user_id)
  VALUES (v_id, v_visitor, v_dn, v_email, auth.uid());

  RETURN QUERY SELECT v_id, v_name, v_code;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_daily_group(text, text, text) TO anon, authenticated;
