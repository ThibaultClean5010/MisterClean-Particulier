-- Lets an authenticated application administrator cancel a booking by ID.
-- API authentication happens before this service-role-only function is called.
create or replace function public.cancel_booking_as_admin(p_booking_id uuid, p_business_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'BOOKING_NOT_FOUND';
  end if;

  if v_booking.status = 'cancelled' then
    return jsonb_build_object('reference', v_booking.reference, 'status', 'cancelled');
  end if;

  update public.bookings
  set status = 'cancelled', cancelled_at = now()
  where id = v_booking.id;

  update public.schedule_blocks
  set active = false
  where id = v_booking.schedule_block_id;

  insert into public.email_outbox (booking_id, template, recipient, payload)
  values
    (v_booking.id, 'booking_customer_cancellation', v_booking.customer_email, '{}'::jsonb),
    (v_booking.id, 'booking_business_cancellation', lower(trim(p_business_email)), '{}'::jsonb)
  on conflict (booking_id, template) do nothing;

  return jsonb_build_object('reference', v_booking.reference, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_booking_as_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_booking_as_admin(uuid, text) to service_role;
