-- La función de auditoría solo la ejecutan los triggers, nunca la API.
revoke execute on function public.fn_auditoria() from public, anon, authenticated;
