Backend source is being migrated into `src/`.
- Entry: `src/server.js`
- Models: `src/models/*` (temp re-exports or copies)
- Config: `src/config/database.js`
- API utils: `src/api/utils/*`

Next steps: move routes and middleware fully under `src/` and update imports.


