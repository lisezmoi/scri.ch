# Changelog

## 2.1.0 — 2026-09-10

### Added

- Store crop dimensions during saves to prevent gallery layout shifts; add a backfill command for existing drawings.
- Open Graph and Twitter card metadata for drawing previews.
- Offline repair tool for browser-readable damaged PNGs, preserving originals and recording repair hashes.

### Changed

- Update Sharp, Bun types, dprint, and TypeScript.
- Remove obsolete PHP-era files.

### Fixed

- Prevent migration from reusing URLs belonging to rejected drawings or orphan media.
- Archive excluded media with filenames, sizes, and hashes.
- Accept single-database dumps without `USE` through `--database scrich`.
- Support multiline SQL inserts while preserving quoted values.

## 2.0.0 — 2026-09-09

### Added

- Record the parent when saving edits to a drawing; preserve legacy parents during import.
- MySQL-to-SQLite migration tool and upgrade guide.
- Local hide/unhide commands and protected gallery.
- Padding-free `-cropped.png` exports.
- Server, migration, and browser tests.

### Changed

- Raise the zoom export limit to 160 megapixels, configurable with `MAX_EXPORT_PIXELS`; generate zooms one at a time.
- PHP/MySQL → TypeScript, Bun, SQLite, and Sharp.
- Environment configuration and separate `DATA_DIR` storage.
- Client ES modules, Pointer Events, and hashed asset builds.
- Runtime code in `src/`; standalone tools in `scripts/`.
- Five-minute PNG caching with ETags; HTML and errors use `no-store`.
- PNG upload validation and size limits.
- Documented drawing options; kept deployment in the README and restored its usage-first structure and credits.

### Fixed

- Keep gallery thumbnails crisp with pixelated rendering.
- Restore the drawing-only 404 page without extra error text.
- Trim all borders of transparent drawings without losing single-pixel marks.
- Preserve exact canvas dimensions when saving with `size`.
- Apply backgrounds to fixed-size PNG and zoom exports.
- Regenerate outdated image derivatives.
- Block hidden drawings during pending image generation and conditional requests.
- Handle pointer cancellation and preserve drawings during canvas resizing.
