# JG3D Cotizador

Aplicación interna para preparar presupuestos de modelado 3D de JG3D Works.

## Estado actual

La aplicación usa Supabase Auth para el acceso privado y una fila protegida por usuario para sincronizar clientes, presupuestos y configuración. `localStorage` funciona únicamente como caché del dispositivo durante la sesión.

## Funciones incluidas

- Clientes y presupuestos de prueba.
- Tarifas separadas de modelado y render.
- Contingencia por dificultad.
- Recargo por urgencia.
- Personalización y licencia comercial.
- Cálculo de comisiones de PayPal.
- Conversión manual de moneda.
- Pagos 100% o 50/50 según el importe.
- Estados del trabajo.
- Vista imprimible para guardar como PDF.
- Mensaje de WhatsApp en español, inglés o portugués.
- Acceso con correo y contraseña.
- Sincronización privada con Supabase y Row Level Security.

## Configuración inicial de Supabase

1. Ejecutar `supabase/schema.sql` desde **SQL Editor**.
2. Crear el usuario propietario desde **Authentication > Users > Add user**.
3. Desactivar el registro público de usuarios desde la configuración de autenticación.
4. Mantener únicamente la URL y la clave pública en `supabase-config.js`. Nunca usar allí una clave secreta o `service_role`.

## Próxima etapa

- Integración de OpenAI mediante una función segura.
- Conversión automática de monedas.

## Publicación

El sitio es estático y no requiere compilación. GitHub Pages debe publicar desde la raíz de la rama `main`.
