-- OT is only earned by ปฏิบัติงานนอกสถานที่ (offsite) that runs past 17:00.
-- A standalone "ปฏิบัติงานนอกเวลา" (type='ot') check-in is just a record and
-- earns NO OT. So fn_field_autofill computes OT only for type='offsite';
-- type='ot' and 'wfh' get zeroed pay fields.

create or replace function fn_field_autofill() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb;
begin
  -- WFH conflict guard still applies to both ot/offsite
  if new.type in ('ot','offsite') then
    if exists (select 1 from field_requests f
               where f.employee_id = new.employee_id and f.type='wfh'
                 and f.status='approved' and f.work_date = new.work_date) then
      raise exception 'วันที่ % เป็นวัน WFH จึงเบิก OT/นอกสถานที่ไม่ได้ (ระเบียบ 2567)', new.work_date;
    end if;
  end if;

  if new.type = 'offsite' then
    if new.planned_start is not null and new.planned_end is not null then
      j := fn_compute_ot(new.employee_id, new.work_date, new.planned_start, new.planned_end);
      new.pay_x1_hours  := (j->>'x1_hours')::numeric;
      new.pay_x15_hours := (j->>'x1_5_hours')::numeric;
      new.pay_x3_hours  := (j->>'x3_hours')::numeric;
      new.ot_hours      := (j->>'ot_hours')::numeric;
      new.ot_type       := nullif(j->>'ot_type','')::ot_type_t;
      new.ot_breakdown  := j;
    end if;
  else
    -- ot / wfh: no OT computed
    new.ot_hours := null; new.ot_type := null; new.ot_breakdown := null;
    new.pay_x1_hours := 0; new.pay_x15_hours := 0; new.pay_x3_hours := 0;
  end if;
  return new;
end $$;
