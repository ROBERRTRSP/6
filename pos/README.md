# Banca Rápida · POS de lotería dominicana

POS simple para venta de jugadas de lotería dominicana.

## Qué incluye

- Venta táctil con teclado numérico y teclado físico
- Juegos:
  - **Quiniela** — 2 dígitos (00–99)
  - **Pale** — 4 dígitos (dos números)
  - **Tripleta** — 6 dígitos (tres números)
  - **Súper Pale** — dos números entre loterías
  - **Pick 3** — Straight / Box / Straight + Box
  - **Pick 4** — Straight / Box / Straight + Box
- Montos rápidos y monto libre
- Ticket imprimible del último sale
- Historial y resumen del día
- Anulación de tickets
- API Express + SQLite

## Arranque local

```bash
cd pos
npm install
npm run dev
```

- API: `http://localhost:43880`
- UI: `http://localhost:5174`

## Scripts

```bash
npm run typecheck
npm run build
npm start
```

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Salud del servicio |
| GET | `/api/summary` | Resumen del día |
| GET | `/api/tickets` | Tickets del día |
| POST | `/api/tickets` | Vender `{ game, betMode?, numbers, amountCents }` |
| POST | `/api/tickets/:id/void` | Anular ticket |
