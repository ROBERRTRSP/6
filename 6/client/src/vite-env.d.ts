/// <reference types="vite/client" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_PORT?: string;
  /** Base absoluta de la API en producción (ej. https://api.tudominio.com). Vacío = mismo origen. */
  readonly VITE_API_BASE?: string;
}
