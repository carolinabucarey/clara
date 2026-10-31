# Auditoría de código de Clara

Fecha: 31 de octubre de 2026.

Se revisaron las rutas de API, el flujo de prendas → fotos → perfil → veredicto → look,
las cuentas y Storage, la configuración de Next.js, las dependencias y los materiales de entrega.
Se leyeron las guías de la versión de Next.js instalada antes de modificar sus rutas y configuración.

## Hallazgos corregidos

| Prioridad | Hallazgo | Corrección |
| --- | --- | --- |
| Alta | El proxy aceptaba URLs de proveedores de almacenamiento compartido, seguía redirecciones y reenviaba el tipo de contenido remoto. | HMAC de la URL completa, comprobación de host/protocolo/credenciales/puerto, sin redirecciones, firma binaria de PNG/JPEG/WebP, `nosniff`, límite de 20 MiB y timeout. |
| Alta | Fotos y estado de la cuenta anterior podían seguir visibles al salir o cambiar de usuario. | Reinicio de la sesión local, consentimiento y preferencias; respuestas antiguas no restauran el perfil de otra cuenta. |
| Alta | El borrado enumeraba solo la primera página de Storage e ignoraba algunos errores. | Recorrido paginado y ordenado de carpetas; borrado por lotes; errores de eliminación y firma de URLs se propagan. |
| Media | Archivos vacíos, tipos falsificados, multipart/JSON incorrectos y cuerpos excesivos no siempre devolvían errores de cliente. | Lectores acotados, validación de firmas y tipos JPEG/PNG, esquemas más estrictos y respuestas 400/413/415. |
| Media | Los endpoints públicos podían recibir solicitudes de pago desde otros sitios sin limitación local. | Comprobación de origen del navegador y hasta 30 solicitudes/minuto por IP y grupo de ruta en cada instancia. |
| Media | Cambiar objetivos o fotos podía conservar veredictos o retratos anteriores y el indicador «guardado». | Invalidación de resultados y firma de guardado que incluye sus entradas; protección contra respuestas asíncronas obsoletas. |
| Media | Una solicitud lenta podía dejar un spinner indefinido o impedir el fallback del modelo dentro de la duración de la ruta. | Timeouts de red, timeout total del polling, cancelación al salir y menor timeout sin reintentos de Claude. |
| Media | El fallo de la caché de desarrollo podía ocultar un resultado de pago correcto; una variable podía habilitar almacenamiento en producción. | Caché siempre deshabilitada en producción; un fallo local conserva la respuesta remota válida. |
| Media | El texto de privacidad omitía los datos enviados a Claude y afirmaba una retención externa no verificada. | Texto bilingüe que identifica los proveedores y los datos enviados; aviso explícito sobre la caché local de desarrollo. |
| Media | La compresión por dimensiones no garantizaba que dos fotos cupieran en una petición al hosting. | Cada imagen preparada se limita a 2 MiB, bajando calidad o dimensiones cuando hace falta. |
| Baja | Recursos temporales y listeners de cancelación podían acumularse; un fallo inicial de MediaPipe bloqueaba posteriores intentos. | Liberación de URLs de objetos, limpieza de listeners y reinicialización de cargas fallidas. |
| Baja | Faltaban recuperación de errores, nombre accesible del diálogo y navegación de los radios por teclado. | `error.tsx` con `retry` de la versión instalada; diálogo etiquetado, flechas/Home/End, foco visible y movimiento reducido. |
| Baja | El README admitía Node 20 aunque Vitest requiere una versión más nueva; faltaba un control reproducible de calidad. | Node 22.12+, `.nvmrc`, generación de tipos de rutas, lint sin avisos, `npm run validate` y workflow de CI. |

El filtro de lenguaje ahora comprueba vocabulario inglés y español independientemente del idioma solicitado.
La explicación sigue apoyándose en reglas deterministas; la validación de vocabulario no demuestra que
cada frase generada por un modelo sea cierta. El texto de Devpost se ajustó a esa capacidad real.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| `npm run lint` | Sin errores ni avisos. |
| `npm run typecheck` | Generación de tipos de Next.js y TypeScript correctos. |
| `npm test` | 107 pruebas correctas en 15 archivos tras integrar los cambios recientes de `main`; la auditoría inicial partió de 64 pruebas en 8 archivos. |
| `npm run build` | Compilación optimizada, tipos y generación de páginas correctos. |
| `git diff --check` | Sin errores de espacios. |
| `npm audit --omit=dev --json` | Cero vulnerabilidades reportadas en dependencias de producción. |
| Navegador, producción local | Inicio correcto, cambio inglés/español y apertura/cierre del diálogo de acceso. Sin errores de aplicación en consola; MediaPipe emite avisos de diagnóstico de OpenGL. |
| Recursos de visión | Los dos modelos y el WASM se sirven con HTTP 200 desde el mismo origen. |
| Rutas HTTP en producción local | JSON incorrecto: 400; multipart incorrecto: 415; origen externo: 403; cuenta sin token: 401; imagen sin firma: 403; diagnóstico de costes: 404. APIs con `private, no-store`. |

Las nuevas pruebas cubren límites de cuerpos incluso sin `Content-Length`, imágenes falsas, firmas
alteradas, errores de red y proveedor, borrado de más de 1.000 archivos, inicio/polling de tareas,
fallback de `cloth-v4` a `cloth`, y entrada manual/veredictos de plantilla sin Claude.
Las integraciones externas están simuladas en estas pruebas: no consumen créditos ni envían fotos.
Los efectos de prueba de prendas y redacción se difieren hasta después de la repetición de efectos
de React en desarrollo; un texto ya generado se reutiliza mientras sus entradas no cambien.
La integración conserva los looks editables, el maquillaje sobre la foto de cuerpo entero y el cambio
independiente de selfie/foto de cuerpo del remoto. La limpieza y la protección frente a respuestas
antiguas se aplican también a las imágenes cargadas desde looks guardados.

El primer intento de compilación dentro del sandbox falló porque Turbopack necesita crear un proceso
con un puerto local. La compilación fuera de esa restricción pasó. No se desactivaron comprobaciones
de TypeScript o lint para conseguirlo.

## Límites y preparación de la entrega

- **Dependencias de desarrollo:** `npm audit` completo reporta 16 entradas moderadas vinculadas a una
  vulnerabilidad transitiva de `minimatch` ([aviso GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)).
  No afecta al árbol de producción. Las soluciones sugeridas por npm cambian versiones principales
  o degradan ESLint/Next de forma incompatible; no se aplicó `npm audit fix --force`.
- **Servicios reales:** falta ensayar la demo completa con imágenes de prueba autorizadas y las claves
  y créditos de YouCam/Claude. No se enviaron fotos personales ni se ejecutaron generaciones de pago.
- **Cuentas:** la migración y las políticas RLS se revisaron estáticamente. Deben comprobarse en el
  proyecto Supabase de entrega con dos cuentas de prueba: aislamiento, guardar/restaurar y borrar.
  No se modificaron datos reales ni se enviaron correos de acceso durante esta auditoría.
- **Escala:** el limitador reside en memoria por instancia y no constituye una cuota global. Las
  rutas anónimas necesitan un límite compartido y control de presupuesto para un lanzamiento amplio.
  Los enlaces firmados de imágenes son capacidades de acceso: quien los recibe puede usarlos hasta
  que expire el recurso de origen; no deben publicarse con fotos personales.
- **Materiales de entrega:** `public/demo/garments.json` está vacío. Añadir prendas de demostración con
  derechos de uso facilitaría la evaluación. El video, enlaces de entrega, licencia del código/recursos
  y requisitos concretos del hackatón deben validarse contra sus bases; no se concedió una licencia nueva.
- **CI:** el workflow queda preparado en el repositorio local. Su ejecución en GitHub se verificará
  después de publicar los cambios. Usa los ejemplos oficiales de
  [checkout](https://github.com/actions/checkout) y [setup-node](https://github.com/actions/setup-node).

Las comprobaciones técnicas anteriores pasan. La aceptación por el jurado depende también de la demo
con los servicios reales y del cumplimiento de las bases de la convocatoria.
