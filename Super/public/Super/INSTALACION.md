# SÚPER LA MUÑECA · FIREBASE PRO 3.0

Aplicación web **solo para un empleado**, diseñada para celular, con tema negro.

## 1. Antes de empezar

Necesitas una cuenta Google, una computadora para la instalación inicial, conexión a internet y un proyecto Firebase propio. La app incluye el código listo; no incluye claves de tu proyecto ni cuentas creadas porque debes autorizarlas tú.

- Web Firebase: https://console.firebase.google.com/
- Manual de Firebase: https://firebase.google.com/docs/web/setup

## 2. Crear tu proyecto Firebase

1. Abre https://console.firebase.google.com/ y pulsa **Crear un proyecto**.
2. Escribe un nombre como `super-la-muneca` (el ID único de proyecto puede variar).
3. En el menú **Compilación > Firestore Database > Crear base de datos**, usa edición **Standard** y selecciona una región cercana. Selecciona **modo producción**. **No actives reglas de prueba ni de acceso público.**
4. En **Compilación > Authentication > Comenzar > Sign-in method**, habilita **Correo electrónico/Contraseña**.
5. En **Authentication > Users > Add user**, crea **una sola cuenta** para la persona que manejará la tienda. Utiliza contraseña segura y NO la compartas.
6. Vuelve a **Configuración del proyecto** (icono de engrane) > **General** > **Tus aplicaciones**. Añade una app **Web (`</>`)**, por ejemplo `super-la-muneca-web`.
7. Firebase te mostrará un objeto `firebaseConfig`. Abre **`public/firebase-config.js`** de este paquete y pega los valores correctos (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`). Conserve las comillas. **No metas contraseñas ni llaves privadas en ese archivo.**

> `firebaseConfig` contiene identificadores públicos del cliente, no contraseñas. La seguridad real depende del inicio de sesión y de las reglas `firestore.rules`.

## 3. Publicar la app y las reglas (desde una computadora)

Instala Node.js (LTS) si no lo tienes: https://nodejs.org

Abre Terminal, PowerShell o Símbolo del sistema dentro de la carpeta **`Super_La_Muneca_Firebase`** (la que contiene `firebase.json`). Ejecuta:

```bash
npm install -g firebase-tools
firebase login
firebase projects:list
firebase deploy --project TU_ID_DE_PROYECTO --only hosting,firestore:rules
```

Cambia `TU_ID_DE_PROYECTO` por el **ID real** de Firebase (`projectId`). No es el nombre visible de la tienda. El último comando sube la página y publica las reglas de seguridad. No necesitas ejecutar `firebase init` porque **este ZIP ya incluye `firebase.json` y `firestore.rules`**. Si el CLI te pregunta si deseas continuar por falta de configuración del proyecto, revisa `projectId` y los permisos de la cuenta Google.

Tu aplicación quedará en una dirección como:

`https://TU_ID_DE_PROYECTO.web.app`

Abre esa URL en el teléfono e inicia sesión con el correo/contraseña que creaste en **Authentication > Users**. Si aparece un error `auth/unauthorized-domain`, revisa **Authentication > Settings > Authorized domains** y agrega el dominio `TU_ID_DE_PROYECTO.web.app` (sin `https://`).

## 4. Agregarla a la pantalla principal del celular

- Android / Chrome: menú ⋮ > **Instalar aplicación** o **Agregar a pantalla principal**.
- iPhone / Safari: **Compartir** > **Agregar a pantalla de inicio**.

La cámara requiere **HTTPS** y permiso para usar la cámara. Lo da Firebase Hosting.

## 5. Cómo usarla

- **Inicio:** ventas del día, productos bajos, clientes y proveedores que deben/cobrar, próximos pedidos.
- **Inventario:** registra productos con su **código de barras real**, precio de compra, precio de venta, existencias y mínimo. Si el empaque no tiene código, la app permite asignar un código interno. Usa la cámara o escribe el número bajo las barras.
- **Vender:** busca o escanea, agrega unidades, cobra en efectivo/transferencia/fiado. El inventario se descuenta y se registra el movimiento.
- **Caja:** abre caja con fondo inicial, registra cobros y gastos, al terminar cuenta el dinero físico y guarda el corte con sobrante/faltante.
- **Deudas:** clientes y proveedores, saldos pendientes, abonos en efectivo o transferencia.
- **Pedidos:** registra proveedor, artículos, unidades, costos y fecha aproximada de llegada. Al recibir, aumenta inventario; si queda a crédito crea la deuda del proveedor.
- **Ajustes (⚙):** indica el estado de Firebase, reintenta sincronización, descarga/respalda JSON, importa respaldos y cierra sesión.

## 6. Organización de datos en Firestore

Dentro de `stores/UID_DEL_USUARIO/`:

```text
meta/state                 # revisión y fecha última confirmada
products/{id}              # código de barras, existencias y precios
inventoryLogs/{id}         # altas, salidas, ventas
sales/{id}                 # tickets y forma de pago
customers/{id}             # saldo de cada cliente
customerMoves/{id}         # abonos y cargos
suppliers/{id}             # deuda con proveedor
supplierMoves/{id}         # cargos y pagos
orders/{id}                # fecha de llegada y costo total
expenses/{id}              # gastos generales
cashSessions/{id}          # aperturas y cortes
cashMovements/{id}         # movimientos de efectivo
```

Cada cambio se envía en una **transacción atómica** con comprobación de revisión: si otra pestaña modificó los datos, la app evita sobreescribirlos silenciosamente. El indicador **«Guardado en Firebase»** confirma que la operación llegó al servidor. Cada documento se escribe de forma independiente, sin almacenar toda la tienda en un único documento.

## 7. Internet, respaldos y advertencias importantes

- Si pierdes internet con la app abierta, pueden quedar movimientos **pendientes solo en este celular**. La app intentará sincronizarlos al reconectar. **NO borres datos del navegador ni cierres sesión si hay pendientes.**
- Si abres la app desconectado y no se pueden verificar los datos remotos, se bloquea el registro de nuevos movimientos hasta reconectar. Esta versión prioriza no perder ventas.
- **Evita manejar la tienda desde dos teléfonos o pestañas al mismo tiempo.** Si se detectan revisiones incompatibles, la app no reemplaza información sin avisar: descarga un respaldo desde ⚙ y resuelve el conflicto.
- Exporta el **respaldo JSON** al menos una vez por semana y guárdalo fuera del celular. La sincronización no sustituye un plan formal de copias de seguridad.
- Para restaurar un respaldo, entra a **Ajustes > Restaurar respaldo**. Sustituye los registros de la tienda actual. Haz un respaldo previo y verifica el resultado.
- Esta primera versión gestiona **unidades enteras**. No es todavía un sistema de venta por peso con báscula ni facturación electrónica SAT.
- La utilidad mostrada es **bruta aproximada** (venta menos costo de producto), no utilidad contable neta.
- No ofrece validación de pagos de tarjeta ni emisión automática de CFDI.
- El lector de barras utiliza una librería externa. Si la cámara no lee el empaque, escribe los números manualmente.
- `firestore.rules` protege por UID autenticado. No hay página de autorregistro. No uses cuentas compartidas.
- Revisa las cuotas disponibles en https://firebase.google.com/pricing antes de aumentar operaciones y configura alertas si activas facturación.

## 8. Si ya utilizabas la versión anterior con Google Sheets

1. Desde la versión anterior abre **Ajustes > Descargar respaldo** y guarda el archivo `.json`.
2. Entra a la nueva aplicación ya conectada a Firebase.
3. Abre **Ajustes > Restaurar respaldo** y selecciona el JSON de la tienda anterior.
4. Espera a que el indicador cambie a **«Guardado en Firebase»** y verifica cantidades, deudas y ventas antes de eliminar la versión anterior.

**No elimines la hoja Google ni la versión anterior hasta comprobar que todos los datos se transfirieron.**

## 9. Si algo falla

**Se queda en «Activa tu Firebase»**: reemplaza TODOS los datos de `public/firebase-config.js`, guarda y vuelve a publicar.

**«Correo o contraseña incorrectos»**: crea la cuenta en Authentication > Users y habilita el proveedor Correo electrónico/Contraseña.

**«Permiso denegado»**: publica `firestore.rules` con el comando de despliegue. Revisa que `projectId` coincida en configuración y CLI.

**Se guardó solo en el celular**: revisa internet, abre Ajustes > Sincronizar ahora, espera el indicador verde. No cierres o recargues antes de que termine.

**No funciona cámara**: abre desde HTTPS, autoriza cámara, mejora la luz y coloca el código de barras completo dentro del marco. Si no funciona, entra el número manual.

---

Proyecto entregado como código fuente listo para conectar. Para tenerlo funcionando con datos reales tienes que crear/autorizar el proyecto Firebase y desplegar los archivos siguiendo estos pasos.
