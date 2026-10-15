import type { DrawingSettings } from "../settings";

function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support canvas.");
  return context;
}

export function createDrawing(canvas: HTMLCanvasElement, settings: DrawingSettings) {
  const context = canvasContext(canvas);
  const copy = document.createElement("canvas");
  const copyContext = canvasContext(copy);

  const background = settings.background ?? "transparent";
  const foreground = settings.foreground ?? "#000000";
  const margin = settings.size ? 0 : (settings.margin ?? 0);
  let minimumWidth = 0;
  let minimumHeight = 0;

  // Clip fractional viewport edges without scaling pixels or hiding larger drawings.
  const frame = document.createElement("div");
  frame.id = "drawing-frame";
  frame.classList.toggle("margin", margin > 0 || Boolean(settings.size));
  canvas.before(frame);
  frame.append(canvas);

  function resize(width?: number, height?: number) {
    const viewport = document.documentElement.getBoundingClientRect();
    const availableWidth = Math.max(0, viewport.width - margin * 2);
    const availableHeight = Math.max(0, viewport.height - margin * 2);
    const viewportWidth = Math.ceil(availableWidth);
    const viewportHeight = Math.ceil(availableHeight);
    // A fresh canvas has no drawing to preserve; some browsers reject empty sources.
    const preserve = minimumWidth > 0 && minimumHeight > 0
      && canvas.width > 0 && canvas.height > 0;
    if (preserve) {
      copy.width = canvas.width;
      copy.height = canvas.height;
      copyContext.clearRect(0, 0, copy.width, copy.height);
      copyContext.drawImage(canvas, 0, 0);
    }
    canvas.width = settings.size?.width || width
      || Math.max(viewportWidth, minimumWidth);
    canvas.height = settings.size?.height || height
      || Math.max(viewportHeight, minimumHeight);
    frame.style.width = `${
      !settings.size?.width && canvas.width === viewportWidth ? availableWidth : canvas.width
    }px`;
    frame.style.height = `${
      !settings.size?.height && canvas.height === viewportHeight ? availableHeight : canvas.height
    }px`;
    frame.style.left = `${
      settings.size?.width ? (viewport.width - settings.size.width) / 2 : margin
    }px`;
    frame.style.top = `${
      settings.size?.height ? (viewport.height - settings.size.height) / 2 : margin
    }px`;
    if (background !== "transparent") {
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (preserve) context.drawImage(copy, 0, 0);
  }

  function track(x: number, y: number) {
    minimumWidth = Math.max(minimumWidth, Math.min(x + 1, canvas.width));
    minimumHeight = Math.max(minimumHeight, Math.min(y + 1, canvas.height));
  }

  return {
    resize,
    async load(source: string) {
      const image = new Image();
      image.src = source;
      await image.decode();
      canvas.width = minimumWidth = image.naturalWidth;
      canvas.height = minimumHeight = image.naturalHeight;
      context.drawImage(image, 0, 0);
    },
    start(x: number, y: number) {
      track(x, y);
      context.fillStyle = foreground;
      context.fillRect(x - 1, y - 1, 2, 2);
      context.beginPath();
      context.moveTo(x, y);
    },
    move(x: number, y: number) {
      track(x, y);
      context.strokeStyle = foreground;
      context.lineTo(x, y);
      context.stroke();
    },
    end() {
      context.stroke();
    },
    save(): { png: string; settings: DrawingSettings; } | null {
      if (minimumWidth <= 0 || minimumHeight <= 0) return null;
      const { width, height } = canvas;
      if (settings.size) {
        return {
          png: canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, ""),
          settings: { ...settings, size: { width, height } },
        };
      }
      resize(minimumWidth, minimumHeight);
      try {
        return {
          png: canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, ""),
          settings,
        };
      } finally {
        resize(width, height);
      }
    },
  };
}
