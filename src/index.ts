/**
 * Vercel detecta Express en `src/index.ts` relativo a la raíz del repositorio.
 * La app Lucky Six vive en `6/`; reexportamos la misma instancia de Express.
 */
export { default } from "../6/src/index.ts";
