-- Pin gen_invite_code's search_path (advisor 0011, function_search_path_mutable).
-- It only uses pg_catalog builtins (random/floor/substr/length), which remain
-- resolvable with an empty search_path, so '' is the safest setting.
alter function private.gen_invite_code() set search_path = '';
