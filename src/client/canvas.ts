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

  // Retain the existing canvas positioning and one canvas pixel per CSS pixel.
  canvas.classList.add("margin");
  canvas.style.left = `${margin}px`;
  canvas.style.top = `${margin}px`;

  function resize(width?: number, height?: number) {
    copy.width = canvas.width;
    copy.height = canvas.height;
    copyContext.clearRect(0, 0, copy.width, copy.height);
    copyContext.drawImage(canvas, 0, 0);
    canvas.width = settings.size?.width || width
      || Math.max(window.innerWidth - margin * 2, minimumWidth);
    canvas.height = settings.size?.height || height
      || Math.max(window.innerHeight - margin * 2, minimumHeight);
    if (settings.size?.width) {
      canvas.style.left = `${(window.innerWidth - settings.size.width) / 2}px`;
    }
    if (settings.size?.height) {
      canvas.style.top = `${(window.innerHeight - settings.size.height) / 2}px`;
    }
    if (background !== "transparent") {
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(copy, 0, 0);
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
