# Drawing options

Add these options to the homepage URL to start a drawing, for example
`/?size=400x300&background=fff&foreground=123456`. Saved drawings keep their original settings;
adding options to a saved drawing or PNG URL does not change them.

| Parameter | Default | Behavior |
| --- | --- | --- |
| `background` | Transparent canvas; white in processed exports | Three- or six-digit hex color. Explicit colors fill the canvas and processed exports. |
| `foreground` | Black | Three- or six-digit hex stroke color; stored pixels are not recolored on export. |
| `size=400` / `size=400x300` | Viewport-sized canvas | Fix both dimensions; preserve the whole canvas on save. |
| `size=400x` / `size=x300` | — | Fix one dimension; the other follows the viewport until save. Both dimensions are then stored. |
| `margin=20` | `0` | Inset the canvas from the viewport edges. Ignored when `size` is set; does not control export padding. |

Colors accept an optional `#` (encode it as `%23` in URLs). Named colors and `transparent` are not
accepted parameter values. Invalid values and unknown parameters are ignored; repeated parameters
use the first value. Size dimensions and nonzero margins must be positive integers up to 32,768.
A size with one valid dimension retains that dimension; a specified pair exceeding 32 megapixels
is ignored.

| Image URL | Without `size` | With `size` | Background |
| --- | --- | --- | --- |
| `-raw.png` | Uploaded canvas; saving removes unused right/bottom space | Entire saved canvas, exact dimensions | Unchanged, including transparency |
| `.png` | Tight crop + 20px padding on each side | Entire saved canvas, no padding | Configured color, otherwise white |
| `-cropped.png` | Tight crop, no padding | Tight crop, no padding | Configured color, otherwise white |
| `-2x.png`, `-3x.png`, `-4x.png` | Enlarge `.png` by the indicated factor | Enlarge `.png` by the indicated factor | Same as `.png` |

Crops detect pixels that differ from the export background. When none differ, the full image is
retained; the default export still adds padding when no size is set. Zooms use nearest-neighbor
scaling. Hidden drawings return 404 for every variant.

New uploads must be valid PNG files no larger than 8 MiB, 32 megapixels, or 32,768 pixels on either
axis. Zoom exports allow up to 160 megapixels by default; larger exports return 403.
Set `MAX_EXPORT_PIXELS` to change the export limit. Zoom images are generated one at a time.
