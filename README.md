# IT-107-Case-Study

FOOD ORDERING MANAGEMENT AND RESTAURANT TABLE MANAGEMENT SYSTEM

## Wingsman Food & Table Management System

Food ordering and table management for Wingsman. A desktop-first restaurant POS interface for seating, order entry, kitchen preparation, billing, menu and promotion settings, and sales reports.

## Tech stack

- HTML, CSS, and browser JavaScript modules
- Node.js 18+ built-in HTTP server (no third-party runtime packages)
- `data/db.json` as the temporary database
- One repository module for database reads and serialized, atomic writes

## Run it

Install Node.js 18 or newer, then from this folder run:

```sh
npm run seed   # reset data/db.json to the sample restaurant data
npm start      # serve the app at http://localhost:8080
```

To use another port, set `PORT` before starting the server. The server creates a fresh seeded database if `data/db.json` is missing or unreadable. `npm run seed` intentionally replaces the current data.

## Pages

The top navigation links to all six workflows:

1. **Table Management** — floor seating, table assignment, reservations, and release.
2. **Order Taking** — menu selection, flavors, quantities, notes, and kitchen submission.
3. **Kitchen Display** — preparation checklists, completion, and order cancellation.
4. **Billing & Payment** — ready-order selection, cash received, change, receipt printing, and payment completion.
5. **Menu & Promo Settings** — menu item CRUD and staged promotion toggles.
6. **Sales Reports** — daily and week-to-date sales, best sellers, peak periods, and print/PDF export. Peak-hour counts use this week’s order timestamps.

## Project layout

```text
app.js                 Browser page entry point
ui.js                  Shared browser helpers and navigation
pages/                 One browser module per page
tokens.css             Shared design tokens
app.css                Responsive page and print styles
server.js              Static file server and JSON REST API
repository.js          Queued JSON reads/writes and atomic replacement
seed-data.js           Initial menu, tables, promos, and seven days of sales
seed.js                Database reset script
data/db.json           Current temporary database and committed sample data
```

## JSON data and pricing

The JSON file stores counters, tables, flavors, menu items, promotions, orders, and payments. Order lines keep a menu-name and price snapshot so receipts and historical sales still make sense if a menu item is later changed or removed. Money is stored as whole pesos or rounded to two decimal places.

Promotion toggles are stored as flags. The `promoRules` function in `server.js` is the single extension point for pricing rules; it currently applies no discount because the designs do not specify one.

## Table and order workflow

Available or reserved tables can be assigned, which creates an empty open order. Sending a non-empty order moves it to **preparing** and keeps the table occupied. The kitchen marks each line prepared before it can mark the order ready. A ready order can be billed and paid; payment saves the amount, change, and timestamp and changes the table to **cleaning**. Releasing a cleaning or reserved table makes it available again. An occupied table with an active order cannot be released.

Kitchen cards refresh about every five seconds. Editing a ready order sends it back to preparation. Cancelling an unpaid order frees its table when no other active order remains.

## UI assumptions

- The navigation follows the six requested pages and uses the existing `tables.html`, `order.html`, `kitchen.htm`, `billing.html`, and `sales.html` routes; `menu.html` is new.
- “Mark as Reserved” is available on an available table. A reservation can be released from the table screen.
- The Flavors chips update the currently focused menu row, and each row only accepts its assigned flavors. Same-item flavor variants are separate order lines.
- Promo switches stage changes until **Save Changes** is clicked. No discount behavior is assumed.
- No `assets/wingsman-logo.png` was present in the project, so Table Management shows a Wingsman text mark in its place.
- Google Fonts are used for Inter and Roboto Slab when the browser can reach Google Fonts; local system fonts are fallbacks.

## Boundaries

This is a local prototype. It does not add login, a real payment gateway, or a production database. The JSON file is intended for development and can later be replaced behind `repository.js`.
