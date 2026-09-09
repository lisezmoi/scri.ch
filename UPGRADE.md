# Upgrading from scri.ch 1.2 to 2.0

## 1. Prepare

Install Bun 1.4 or newer in the new application checkout, then run:

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun run check
bun run build
```

Stop writes to the PHP installation. Back up its MySQL database and `drawings/` directory, and
keep the PHP deployment available until cutover is verified.

## 2. Import

Use an uncompressed SQL dump containing the `scrich` database, its `USE` statement, and standard
`INSERT INTO` statements without column lists. Replace the example paths below. Neither output
directory may already exist.

```sh
bun run migrate:mysql-to-sqlite -- \
  --source /backups/scrich.sql \
  --media-dir /backups/legacy-drawings \
  --output-dir /srv/scrich-data \
  --rejected-dir /backups/scrich-rejected
```

The importer preserves source files, drawing IDs, parent relationships, and accepted original PNGs. Crops and zooms are
regenerated. Review `report.json` and `manifest.jsonl` in the rejected directory: invalid or missing
images, orphan files, and the reserved `404` drawing are not imported. Conflicting duplicates or
missing or rejected parents stop the import. Resolve failures and retry with new output paths.

## 3. Start

`config.php` is replaced by environment variables. Set an absolute `DATA_DIR` writable by the Bun
process and a `PUBLIC_ORIGIN` without a subdirectory. Replace the example domain and credentials:

```sh
NODE_ENV=production \
DATA_DIR=/srv/scrich-data \
PUBLIC_ORIGIN=https://draw.example.org \
GALLERY_USERNAME=viewer \
GALLERY_PASSWORD='replace-me' \
bun run start
```

Omit both gallery variables to disable the gallery. Configure your service manager to run this
command with the same environment. Bun listens on `127.0.0.1:3000` by default.

## 4. Switch traffic

- Check imported drawing pages, raw/cropped/zoom PNGs, gallery authentication, and a new upload.
- Point your TLS reverse proxy at Bun. Replace PHP rewrite rules and direct drawing-file serving;
  all drawing URLs must pass through Bun. Port any custom PHP routes or plugins before cutover.
- Allow request bodies of at least 11 MiB and respect response cache headers. Purge existing
  proxy/CDN drawing entries. PNGs now cache for five minutes; older browser caches cannot be recalled.
- Repeat the checks through the public domain, then back up the new data directory with Bun stopped.

To roll back, stop Bun and route traffic back to PHP. Preserve the Bun data directory: drawings
created after cutover are not copied back to MySQL automatically.
