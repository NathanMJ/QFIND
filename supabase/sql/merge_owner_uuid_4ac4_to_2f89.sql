-- Merge owner UUIDs (data migration)
-- Goal:
-- - Keep final owner id: 2f8993fa-5dd0-42cd-a4bb-e0de2c6a0fd7
-- - Move all references from: 4ac4fb9a-c489-46a8-a8f0-3379d48731f1
-- - Remove the old row:
--   - delete 4ac4... owner row after references are moved
--
-- Notes:
-- - FK constraints referencing public.owners(id) are NOT ON UPDATE CASCADE.
-- - Because 2f89... is already referenced (FK RESTRICT), we do NOT delete it.
--   Instead, we move references from 4ac4... to 2f89..., then delete 4ac4....

begin;

with src as (
  select created_at, last_seen_at
  from public.owners
  where id = '4ac4fb9a-c489-46a8-a8f0-3379d48731f1'
)
update public.owners o
set
  created_at = coalesce((select created_at from src), o.created_at),
  last_seen_at = coalesce((select last_seen_at from src), o.last_seen_at)
where o.id = '2f8993fa-5dd0-42cd-a4bb-e0de2c6a0fd7';

update public.shops
set owner_uuid = '2f8993fa-5dd0-42cd-a4bb-e0de2c6a0fd7'
where owner_uuid = '4ac4fb9a-c489-46a8-a8f0-3379d48731f1';

update public.shop_visits
set owner_uuid = '2f8993fa-5dd0-42cd-a4bb-e0de2c6a0fd7'
where owner_uuid = '4ac4fb9a-c489-46a8-a8f0-3379d48731f1';

update public.wallet_transactions
set owner_uuid = '2f8993fa-5dd0-42cd-a4bb-e0de2c6a0fd7'
where owner_uuid = '4ac4fb9a-c489-46a8-a8f0-3379d48731f1';

delete from public.owners
where id = '4ac4fb9a-c489-46a8-a8f0-3379d48731f1';

commit;

