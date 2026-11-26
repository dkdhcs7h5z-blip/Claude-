\set QUIET on
set client_min_messages = warning;
-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------
\set QUIET off
select n, case when passed then 'PASS' else 'FAIL' end as result, name,
       case when not passed then detail end as detail
from tst.results order by n;

do $$
declare f int; t int;
begin
  select count(*) filter (where not passed), count(*) into f, t from tst.results;
  raise notice '% / % tests passed', t - f, t;
  if f > 0 then raise exception '% test(s) failed', f; end if;
end $$;
