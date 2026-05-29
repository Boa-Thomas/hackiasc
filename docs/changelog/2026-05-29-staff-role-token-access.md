# feat: Acesso staff (Muro + Check-in) via link de auto-login

**Data:** 2026-05-29

## O que foi feito
- Novo role `staff` (JWT app_metadata): opera Muro de Dores + Check-in, nada mais.
- Link `#admin-acesso?t=<token>`: faz signInWithPassword numa conta dedicada e
  remove o token da URL; useAdminAuth assume a sessão via SIGNED_IN.
- AdminPanel: role `staff` vê só as abas Muro + Check-in (default Muro).

## Backend (`migrations/add_staff_role.sql`)
- `is_wall_staff()` (admin|staff); `is_checkin_staff()` passa a incluir staff.
- Policy de SELECT de confirmados em registrations inclui staff.
- RPCs do muro (`wall_set_phase`/`hide`/`unhide`/`admin_list`/`admin_add_pain`)
  passam a aceitar staff.

## Segurança
- O link é a credencial; revogação = trocar a senha da conta staff. Role limitado
  + timeout de inatividade de 30 min. Staff vê PII só de confirmados/votantes.
