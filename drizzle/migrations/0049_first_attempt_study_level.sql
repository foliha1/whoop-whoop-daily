DROP FUNCTION IF EXISTS public.get_first_attempt(text, integer);
CREATE FUNCTION public.get_first_attempt(p_visitor_id text, p_puzzle_number integer)
 RETURNS TABLE(is_mine boolean, puzzle_number integer, puzzle_date date, rounds_solved integer, total_misses integer, peek_used boolean, round_events jsonb, elapsed_ms integer, created_at timestamp with time zone, study_level text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT (r.visitor_id = public.caller_visitor(p_visitor_id)), r.puzzle_number, r.puzzle_date,
         r.rounds_solved, r.total_misses, r.peek_used, r.round_events, r.elapsed_ms, r.created_at, r.study_level
  FROM public.daily_results r
  WHERE r.puzzle_number = p_puzzle_number
    AND ((r.visitor_id = public.caller_visitor(p_visitor_id)
          AND (r.user_id IS NULL OR r.user_id = auth.uid()))
         OR (auth.uid() IS NOT NULL AND r.user_id = auth.uid()))
  ORDER BY r.created_at ASC, r.id ASC
  LIMIT 1
$function$;
GRANT EXECUTE ON FUNCTION public.get_first_attempt(text, integer) TO anon, authenticated, service_role;