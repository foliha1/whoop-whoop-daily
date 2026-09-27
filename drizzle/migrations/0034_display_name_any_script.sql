CREATE OR REPLACE FUNCTION public.display_name_allowed(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  -- Names may use any script. Length counts Unicode code points after NFKC,
  -- trim and whitespace collapse (the app counts the same way).
  SELECT char_length(regexp_replace(btrim(normalize(coalesce(p_name, ''), NFKC)), '[[:space:]]+', ' ', 'g')) BETWEEN 1 AND 6
    AND coalesce(p_name, '') !~ '[[:cntrl:]]'
    -- Invisible and direction-changing characters.
    AND coalesce(p_name, '') !~ '[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]'
    -- At least one letter or number in any language (emoji/symbol-only rejected).
    AND normalize(coalesce(p_name, ''), NFKC) ~ '[[:alpha:][:digit:]]'
    -- Latin bad-word check unchanged (a-z/0-9 folding with digit swaps).
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_display_names b
      WHERE b.normalized_name = public.normalized_display_name(p_name)
    )
$function$;

REVOKE ALL ON FUNCTION public.display_name_allowed(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.display_name_allowed(text) TO service_role;