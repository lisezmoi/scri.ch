# Upgrading scri.ch

## Next version

After deploying this update, backfill dimensions for existing drawings:

```sh
DATA_DIR=/srv/scrich-data bun run drawing:backfill-dimensions
```

The database columns are added automatically. The command prepares previews and skips completed
rows; failures are reported by drawing ID and can be retried by running it again.

## From 1.2 to 2.0

### 1. Prepare

Install Bun 1.4 or newer in the new application checkout, then run:

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun run check
bun run build
```

Stop writes to the PHP installation. Back up its MySQL database and `drawings/` directory, and
keep the PHP deployment available until cutover is verified.

### 2. Import

#### Optional: repair browser-readable damaged PNGs

Some old PNGs are truncated but still display in browsers. The migration's strict decoder
rejects them. To produce valid PNG copies of their browser-visible pixels:

```sh
bun run migrate:repair-pngs \
  --media-dir /backups/legacy-drawings \
  --output-dir /backups/scrich-png-repairs
```

The output directory must not exist; its parent must exist. Install Chromium with
`bunx playwright install chromium` first. The tool works offline, keeps originals untouched,
and only writes repaired PNGs into `scrich-png-repairs/drawings/`. Valid originals are not copied.
`manifest.jsonl` records each source hash, outcome and repaired hash; `report.json` summarizes
results. Add `--ids 5s6,d4q` to examine specific drawings instead of scanning all original PNGs.
A completed report distinguishes valid, repaired and unrecoverable files. If the command fails,
its manifest is partial: inspect the error and retry into a new output directory.

Repair cannot restore missing content. It preserves Chromium's displayed pixels, checks an
exact browser pixel roundtrip, and validates the output with Sharp. Review the repaired drawings
before using them. Do not apply this permissive recovery process to new uploads.

To import the reviewed repairs, make a separate working copy of the original media and overlay
only the repaired files. Use a new, nonexistent working-copy path:

```sh
cp -a /backups/legacy-drawings /backups/scrich-migration-media
cp /backups/scrich-png-repairs/drawings/*.png /backups/scrich-migration-media/
```

Run the importer below with `--media-dir /backups/scrich-migration-media`. Retain the original
SQL/media backup and the repair manifest so normalized images can be traced to their originals.

#### Run the importer

Use an uncompressed SQL dump containing the `scrich` database, a `USE scrich;` statement, and standard
`INSERT INTO` statements without column lists. Inserts may span multiple lines; LF and CRLF
line endings are supported. Do not normalize whitespace inside quoted settings values. Replace the example paths below. Neither output
directory may already exist.

```sh
bun run migrate:mysql-to-sqlite -- \
  --source /backups/scrich.sql \
  --media-dir /backups/legacy-drawings \
  --output-dir /srv/scrich-data \
  --rejected-dir /backups/scrich-rejected
```

For a single-database dump that omits `USE`, add `--database scrich` to the command.
This explicitly identifies the source database; it does not override another database named in the dump.

The importer preserves source files, drawing IDs, parent relationships, and accepted original PNGs. Crops and zooms are
regenerated. Review `report.json` and `manifest.jsonl` in the rejected directory: invalid or missing
images, orphan files (including derivative-only IDs), and the reserved `404` drawing are not imported.
Excluded media is copied into the rejection archive and listed with sizes and SHA-256 hashes.
The allocator advances past all IDs in the SQL and recognized media filenames, including rejected
and orphaned drawings, so their URLs cannot be reused. `report.json` records `nextDrawingValue`.
Keep the complete original SQL/media backup too; files outside the recognized naming patterns
are not migration inputs. Conflicting duplicates or
missing or rejected parents stop the import. Resolve failures and retry with new output paths.

### 3. Start

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

### 4. Switch traffic

- Check imported drawing pages, raw/cropped/zoom PNGs, gallery authentication, and a new upload.
- Point your TLS reverse proxy at Bun. Replace PHP rewrite rules and direct drawing-file serving;
  all drawing URLs must pass through Bun. Port any custom PHP routes or plugins before cutover.
- Allow request bodies of at least 11 MiB and respect response cache headers. Purge existing
  proxy/CDN drawing entries. PNGs now cache for five minutes; older browser caches cannot be recalled.
- Repeat the checks through the public domain, then back up the new data directory with Bun stopped.

To roll back, stop Bun and route traffic back to PHP. Preserve the Bun data directory: drawings
created after cutover are not copied back to MySQL automatically.
