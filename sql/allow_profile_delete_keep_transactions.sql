begin;

alter table public.transactions
  alter column performed_by_user_id drop not null;

do $$
declare
  existing_fk_name text;
  performed_by_attnum smallint;
begin
  select attnum
  into performed_by_attnum
  from pg_attribute
  where attrelid = 'public.transactions'::regclass
    and attname = 'performed_by_user_id'
    and not attisdropped;

  select conname
  into existing_fk_name
  from pg_constraint
  where conrelid = 'public.transactions'::regclass
    and confrelid = 'public.profiles'::regclass
    and contype = 'f'
    and conkey = array[performed_by_attnum];

  if existing_fk_name is not null then
    execute format(
      'alter table public.transactions drop constraint %I',
      existing_fk_name
    );
  end if;
end $$;

alter table public.transactions
  add constraint transactions_performed_by_user_id_fkey
  foreign key (performed_by_user_id)
  references public.profiles(id)
  on delete set null;

commit;
