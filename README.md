# IT-107-Case-Study

FOOD ORDERING MANAGEMENT AND RESTAURANT TABLE MANAGEMENT SYSTEM

## Wingsman Food & Table Management System

Food ordering and table management for Wingsman. A desktop-first restaurant POS interface for seating, order entry, kitchen preparation, billing, menu and promotion settings, and sales reports.

## Tech stack

- HTML, CSS, and browser JavaScript
- Browser `localStorage` for saved restaurant data
- No install, server, or network connection required to run the app

## Run it

Press **F5** in VS Code and choose **Launch Wingsman index.html**, or open `index.html` directly. All six workflows run inside that document. Data is saved automatically in the browser on this computer.

## Pages

The top navigation switches between all six in-page workflows:

1. **Table Management** — floor seating, table assignment, reservations, and release.
2. **Order Taking** — menu selection, flavors, quantities, notes, and kitchen submission.
3. **Kitchen Display** — preparation checklists, completion, and order cancellation.
4. **Billing & Payment** — ready-order selection, cash received, change, receipt printing, and payment completion.
5. **Menu & Promo Settings** — menu item CRUD and staged promotion toggles.
6. **Sales Reports** — daily and week-to-date sales, best sellers, peak periods, and print/PDF export. Peak-hour counts use this week’s order timestamps.

## Project layout

```text
index.html             Single document for all six app views
app.js                 Browser page entry point and hash navigation
ui.js                  Shared browser helpers and navigation
data-store.js          Local browser data and workflow operations
assets/initial-state.js Starting restaurant data, loaded on first run
pages/                 One classic browser script per workflow
assets/wingsman-logo.png  Wingsman logo from the supplied design reference
tokens.css             Shared design tokens
app.css                Responsive page and print styles
```

## Data and pricing

Browser storage keeps tables, flavors, menu items, promotions, orders, and payments. Order lines keep a menu-name and price snapshot so receipts and historical sales still make sense if a menu item is later changed or removed. Money is stored as whole pesos or rounded to two decimal places.

Promotion toggles are stored as flags. They do not change prices because the designs do not specify discount rules.

## Table and order workflow

Available or reserved tables can be assigned, which creates an empty open order. Sending a non-empty order moves it to **preparing** and keeps the table occupied. The kitchen marks each line prepared before it can mark the order ready. A ready order can be billed and paid; payment saves the amount, change, and timestamp and changes the table to **cleaning**. Releasing a cleaning or reserved table makes it available again. An occupied table with an active order cannot be released.

Kitchen cards refresh about every five seconds. Editing a ready order sends it back to preparation. Cancelling an unpaid order frees its table when no other active order remains.

## UI assumptions

- The navigation follows the six requested workflows inside `index.html`. Earlier page URLs redirect to the corresponding in-page route.
- “Mark as Reserved” is available on an available table. A reservation can be released from the table screen.
- The Flavors chips update the currently focused menu row, and each row only accepts its assigned flavors. Same-item flavor variants are separate order lines.
- Promo switches stage changes until **Save Changes** is clicked. No discount behavior is assumed.
- Table Management uses the Wingsman logo from the supplied design reference.
- Google Fonts are used for Inter and Roboto Slab when the browser can reach Google Fonts; local system fonts are fallbacks.

## Boundaries

This is a local prototype. It does not add login, a real payment gateway, or a production database. Saved data stays in the browser profile used to open `index.html`.
