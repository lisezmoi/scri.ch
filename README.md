# scri.ch

scri.ch is a minimal web app that lets you draw, share, and fork existing drawings.

[Try it on scri.ch](https://scri.ch/)

## How to use

1. Draw on the blank page.
2. Click **Save**.
3. Copy the URL and share it.
4. Keep drawing, or click **New** to start again.

## URL params

You can choose colors, a canvas size, or a margin when starting a drawing. For example:

```text
https://scri.ch/?background=ddd&foreground=666
```

- `background=ddd`: background color in hex, without `#`.
- `foreground=666`: pen color in hex, without `#`.
- `size=400`: a square canvas, 400 pixels wide and high.
- `size=400x300`: a canvas with a specific width and height.
- `size=400x` or `size=x300`: set just the width or height.
- `margin=20`: space around the canvas. Ignored when a size is set.

Short and six-digit colors both work. See [all options](docs/drawing-options.md) for more details.

## Image URLs

Add `.png` to a drawing URL to get a cropped image with a white background and a 20px border.
If you chose a background color, it uses that color instead. If you set a canvas size, the image
keeps that size without cropping or adding a border.

You can also use:

- `-cropped.png` for a tight crop without a border.
- `-raw.png` for the original canvas, including any transparency.
- `-2x.png`, `-3x.png`, or `-4x.png` for a larger image.

For example: [scri.ch/baf-2x.png](https://scri.ch/baf-2x.png).

## Installation

Install [Bun](https://bun.sh/) 1.4 or newer, download this project, and run:

```sh
bun install --frozen-lockfile
bun run dev
```

Open <http://localhost:3000> and draw!

Drawings are saved in `/tmp/scrich-development`. To choose another folder:

```sh
DATA_DIR=/path/to/drawings bun run dev
```

Upgrading from 1.2? See [UPGRADE.md](UPGRADE.md).

## Production

To run your own scri.ch, build the app and start it with your domain and data folder:

```sh
bun run build

NODE_ENV=production \
DATA_DIR=/srv/scrich-data \
PUBLIC_ORIGIN=https://draw.example.org \
bun run start
```

Replace the domain and data folder with your own. `DATA_DIR` must be an absolute path the server
can write to. The server listens on `127.0.0.1:3000`; use `HOST` or `PORT` to change it.

Use a reverse proxy for HTTPS. Forward drawing pages and PNG requests to Bun, respect its cache
headers, and allow uploads of at least 11 MiB. Include `dist/` when deploying, or build on the server.

Zoom exports allow up to 160 megapixels. Set `MAX_EXPORT_PIXELS` to change that limit.

Use a service manager to keep scri.ch running. To back up drawings, stop it and copy `DATA_DIR`.

Set `GALLERY_USERNAME` and `GALLERY_PASSWORD` to enable the password-protected `/gallery` page.
To hide or restore a drawing, use your server's data folder:

```sh
DATA_DIR=/srv/scrich-data bun run drawing:hide <id>
DATA_DIR=/srv/scrich-data bun run drawing:unhide <id>
```

Hiding keeps the drawing so you can restore it later. Cached images may stay visible for five minutes.

## Development

`bun run dev` picks up your changes. Reload the browser to see them.

To run the checks:

```sh
bunx playwright install chromium # Only needed once
bun run check
```

See [CHANGELOG.md](CHANGELOG.md) for changes.

## Credits

A simple idea by [Pierre Bertet](https://pierrebertet.net/) and
[Raphaël Bastide](https://raphaelbastide.com/).

- [Aude Debout](http://aude-debout.fr/): 404 drawing, testing
- [Quick and Dirty](https://twitter.com/qndirty): testing, evangelism
- [Jimpunk](http://www.jimpunk.com/.net/index.php?s=scri.ch): scri.ch artist

## License

[MIT](LICENSE)
