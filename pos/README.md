# Banca Rápida · POS de lotería

POS simple para venta de jugadas de lotería (Quiniela, Pale y Tripleta).

## Qué incluye

- Venta táctil con teclado numérico
- Juegos: Quiniela (1 número), Pale (2), Tripleta (3)
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
| POST | `/api/tickets` | Vender ticket `{ game, numbers, amountCents }` |
| POST | `/api/tickets/:id/void` | Anular ticket |
