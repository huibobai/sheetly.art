do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'sheets'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%sheet_size%'
  loop
    execute format('alter table public.sheets drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.sheets
  add constraint sheets_sheet_size_check
  check (sheet_size in ('a4', 'square', '4x6'));
