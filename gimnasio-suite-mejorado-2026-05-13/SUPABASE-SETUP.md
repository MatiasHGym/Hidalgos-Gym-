# Conexion Supabase - Hidalgo GYM

Proyecto detectado:

`https://ewrkclebqdgfsntsoqjs.supabase.co`

## 1. Crear tablas y seguridad

1. Entra a Supabase.
2. Abre `SQL Editor`.
3. Copia y ejecuta todo el contenido de `supabase-schema.sql`.

Eso crea tablas, relaciones, indices y reglas RLS.

## 2. Key publica

La `publishable key` ya esta configurada en `supabase-config.js`.

No uses la `service_role key` en esta app.

## 3. Crear usuarios

En Supabase:

`Authentication` -> `Users` -> `Add user`

Crea al menos:

- Admin
- Yoga
- Boxeo
- Pesas

## 4. Crear perfiles

Despues de crear usuarios, copia sus `User UID` y agrega filas en `profiles`.

Ejemplo:

```sql
insert into public.profiles (id, email, role, area, full_name)
values
  ('UID_ADMIN', 'admin@correo.cl', 'admin', null, 'Administrador'),
  ('UID_YOGA', 'yoga@correo.cl', 'coach', 'yoga', 'Profesora Yoga'),
  ('UID_BOXEO', 'boxeo@correo.cl', 'coach', 'boxeo', 'Profesor Boxeo'),
  ('UID_PESAS', 'pesas@correo.cl', 'coach', 'pesas', 'Profesor Pesas');
```

## Estado actual

La app ya tiene:

- SQL seguro preparado.
- URL del proyecto configurada.
- Cliente Supabase base.
- CSP autorizando solo este proyecto Supabase.

Falta completar:

- Crear usuarios y perfiles.
- Ejecutar una migracion desde el boton `Migrar a nube` del administrador si ya hay datos locales.
