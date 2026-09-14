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

## Recibos e ingresos por ventas directas

El módulo **Recibos e ingresos** registra pagos externos a Cults. Permite crear un recibo desde el módulo, desde un cliente o desde un presupuesto. Los datos copiados se revisan antes de confirmar el pago; una seña o saldo debe cargarse con su importe y concepto reales.

- Precios por concepto en USD, cantidad, formato, versión, descripción y enlace HTTP(S) de entrega. No se suben STL.
- Moneda del pago USD/BRL/ARS, bruto, comisión real y neto. La comisión se ingresa en la misma moneda del cobro; el neto y las comisiones nunca aparecen en el PDF ni en WhatsApp.
- El cambio y su origen se conservan con la venta. Para pagos antiguos se ingresa el cambio real; la consulta actual usa las mismas fuentes del cotizador (dólar blue venta y USD/BRL de referencia).
- PDF y mensaje ES/EN/PT según el cliente, con posibilidad de elegir idioma al emitir. El PDF incluye identidad JG3D, bandera argentina y enlaces. Los documentos extensos se distribuyen en hojas A4 legibles.
- Estados pagado, enviado y anulado. Enviado es una marca manual, no un envío automático. La anulación exige un motivo y excluye el recibo de los ingresos.
- Filtro interactivo por año, cliente, estado, medio, moneda y origen; agrupaciones por año, mes, país, cliente, medio o moneda. La fecha completa se conserva en cada recibo.
- Al cambiar un presupuesto a **Entregado**, se crea automáticamente un recibo/ingreso vinculado al cliente y al presupuesto. Usa el total cobrado guardado en el presupuesto y una referencia idempotente para no duplicarlo si el estado se vuelve a cambiar.

### Base de datos

La migración `supabase/migrations/20260914211032_jg3d_private_receipts.sql` agrega `public.receipts` con RLS por propietario y un contador privado por usuario/año de emisión (zona Argentina). No altera `workspaces`. Los recibos se guardan directamente en Supabase, sin caché local de pagos. El UUID de cada borrador evita duplicar el registro al reintentar después de perder una respuesta. Una referencia de operación no vacía es única por usuario y medio para recibos no anulados.

Solo se permite actualizar estado y motivo; los importes y el cliente guardado son inmutables tras emitir. No hay borrado de recibos desde la aplicación. El contador es accesible exclusivamente por un trigger en un esquema privado que verifica `auth.uid()`; la ausencia de políticas para acceso directo al contador es intencional.

### Verificación

Se probaron cálculos, tres idiomas y monedas, alta de cliente, estados, historial, PDF y regresión de presupuestos con datos ficticios. En Supabase se verificaron permisos, aislamiento por usuario, numeración, edición restringida y anulación dentro de transacciones revertidas. No se agregaron pagos de prueba permanentes.
