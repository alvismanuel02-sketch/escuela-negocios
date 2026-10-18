# Escuela de Negocios · administración del fondo

Aplicación web para administrar el fondo colaborativo de ahorro y préstamos.
Es un sitio estático (HTML, CSS y JavaScript sin compilar) que se publica con
GitHub Pages y guarda todo en Supabase.

**Este repositorio no contiene datos de los socios.** Los datos viven solo en
Supabase y únicamente los ven los administradores después de iniciar sesión.

## Reglas que aplica

- Interés diario sobre el saldo de capital: `saldo × tasa / 30 × días`.
- Préstamo cubierto por el capital del socio: 2% mensual. La parte que lo supera: 5%.
  Sin capital que lo respalde: 10%. Una tasa pactada anula la regla.
- Cada pago cubre primero los intereses acumulados y el resto baja capital.
- Lo que se paga de más se abona al capital del socio.
- Un cruce descuenta el pago del capital del socio. El préstamo se sigue
  calculando con el capital que respaldaba el préstamo al desembolso.

Todo el cálculo está en `js/motor.js` y se prueba contra casos reales ya
validados con `npm test`.

## Estructura

| Ruta | Qué hay |
|---|---|
| `index.html`, `css/` | La página |
| `js/motor.js` | Cálculo de intereses, saldos y planes de cuotas |
| `js/modelo.js` | Saldos del fondo, de cada socio y estado de cada plan |
| `js/app.js` | Pantallas |
| `js/datos.js`, `js/config.js` | Conexión a Supabase |
| `supabase/migrations/` | Estructura de la base, seguridad y auditoría |
| `tests/` | Pruebas del motor |

## Publicar con GitHub Pages

1. En el repositorio: **Settings → Pages → Build and deployment**.
2. Source: **Deploy from a branch**. Branch: `main`, carpeta `/ (root)`.
3. En un minuto queda en `https://<usuario>.github.io/<repositorio>/`.

Después, en Supabase: **Authentication → URL Configuration**, poner esa dirección
en **Site URL**. Sirve para los correos de recuperación de contraseña.

## Agregar un administrador

En Supabase, **SQL Editor**:

```sql
insert into public.administradores (email, nombre) values ('correo@ejemplo.com', 'Nombre');
```

Luego, en **Authentication → Users → Add user → Create new user**, crear el
usuario con ese correo, una contraseña temporal y la casilla **Auto Confirm User**.
Solo los correos de la tabla `administradores` pueden ver o cambiar datos.

## Copias de seguridad

El plan gratuito de Supabase no guarda copias descargables. Exporta las tablas una
vez al mes desde **Table Editor → (tabla) → Export to CSV**. Además, si nadie usa
la app durante una semana, Supabase pausa el proyecto; se reactiva desde el panel
sin perder datos.
