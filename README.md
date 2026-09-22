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
- La conversión automática de monedas ya está implementada, con ajuste manual.

## Pedidos de archivos STL

La sección **Pedidos de archivos** prepara presupuestos para archivos existentes, separados de los trabajos de modelado:

- Buscar productos por nombre, ECU o vehículo en el catálogo público JG3D, o agregarlos manualmente. Se puede editar el precio USD de cada archivo para ese pedido. Cada fila es un archivo o pack; máximo 30 filas.
- Se consulta `jg3dworks/main/catalog/data.js` como JSON, sin ejecutar el contenido remoto. Si no se puede actualizar, se muestra la fecha de la copia incluida en `orders-catalog.json`. Los precios son referencias del catálogo: no una consulta en tiempo real a Cults.
- Activar marca del cliente agrega 20% a todos los archivos. Después se resta el descuento fijo en USD. El total debe ser positivo.
- Para PayPal se calcula el bruto necesario para cubrir el neto acordado usando la comisión configurada y redondeo hacia arriba al centavo. La comisión vigente en la aplicación se conserva en cada pedido.
- Elegir uso personal o venta de piezas impresas. PDF y texto WhatsApp ES/EN/PT incluyen archivo/precio, personalización, descuento, total y condición de 100% anticipado. El código de impresión pagina los pedidos extensos.
- **Revisar cobro** abre fecha, medio, moneda, tipo de cambio, bruto y comisión editables. Una casilla confirma la revisión; cerrar no guarda ni suma ingresos. El importe debe coincidir con el total completo. Para cobros en otra moneda se usa el cambio acordado, sin inferirlo automáticamente de un pago parcial.
- El estado pagado se deriva del recibo válido. **Marcar entregado** solo se habilita tras el cobro y no crea otro ingreso. Si se anula el recibo, vuelve a quedar pendiente; el reemplazo requiere una nueva confirmación.

### Persistencia y compatibilidad

No requiere migraciones. Los pedidos se guardan con `kind: "file_order"` dentro del JSON `workspaces.quotes`; la aplicación los separa de los presupuestos de modelado al cargar y los combina al guardar. Conserva las políticas existentes por usuario. Evitar usar una pestaña con una versión anterior de la app mientras se editan pedidos: esa versión no conoce el nuevo tipo.

El recibo usa `source_quote_id` para vincular el pedido y guarda su copia inmutable desglosada en `exchange_info.fileOrder`. Un concepto agregado concilia el bruto con el esquema de recibos existente, que no admite conceptos negativos; el PDF muestra el desglose original. El balance sigue tomando únicamente recibos válidos y no agrega otra fuente de ingresos.

`orders-payment.js` usa un UUID determinista por propietario, pedido e historial de anulaciones. Reintentos, respuestas perdidas e intentos simultáneos no emiten dos recibos para el mismo cobro, incluso si cambia el medio de pago.

### Verificación del módulo de pedidos

Ejecutar con Node: `node --test tests/orders.test.cjs tests/orders-payment.test.cjs`.
Las 12 pruebas cubren cálculo, redondeo, idiomas, escape de texto, pagos parciales, reintentos, concurrencia, anulación y cambios de sesión.

Se comprobó el formato de inserción contra Supabase usando el rol autenticado dentro de una transacción revertida. Se confirmó después que no quedó el registro de prueba.

`tests/orders-browser.cjs` contiene el recorrido con transporte Supabase simulado para ejecutar con Playwright y Chromium instalados, sirviendo esta carpeta en `http://127.0.0.1:8765`. No accede a producción. La revisión visual y esa prueba de navegador quedaron pendientes en este entorno: no había Chromium instalado y el navegador remoto bloqueó la apertura de archivos locales. Revisar móvil y PDF antes de publicar.

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
