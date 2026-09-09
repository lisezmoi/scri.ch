import type { DrawingSettings } from "../settings";
import { createDrawing } from "./canvas";

interface PageData {
  settings: DrawingSettings;
  homeUrl: string;
  drawingUrl: string | null;
}

function element<T extends HTMLElement>(id: string, type: { new(): T; }): T {
  const value = document.getElementById(id);
  if (!(value instanceof type)) throw new Error(`Missing ${id} element`);
  return value;
}

function startHint(): () => void {
  const title = document.title;
  let left = true;
  let timer = window.setTimeout(animate, 4000);
  function animate() {
    document.title = `Draw! ${left ? "" : "\u00a0"}✎${left ? "\u00a0" : ""}`;
    left = !left;
    timer = window.setTimeout(animate, 300);
  }
  return () => {
    window.clearTimeout(timer);
    document.title = title;
  };
}

async function initialize() {
  const data: PageData = JSON.parse(element("drawing-data", HTMLScriptElement).textContent!);
  const canvas = element("drawing", HTMLCanvasElement);
  const save = element("save", HTMLButtonElement);
  const newDrawing = element("new", HTMLButtonElement);
  const about = element("about", HTMLAnchorElement);
  const form = element("form", HTMLFormElement);
  const drawing = createDrawing(canvas, data.settings);
  if (data.drawingUrl) await drawing.load(data.drawingUrl);
  drawing.resize();

  let stopHint = data.drawingUrl ? () => {} : startHint();
  let activePointer: number | null = null;
  const coordinates = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (activePointer !== null || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    activePointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    const { x, y } = coordinates(event);
    drawing.start(x, y);
    for (const button of [save, newDrawing, about]) button.style.display = "block";
    stopHint();
    stopHint = () => {};
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointer) return;
    const { x, y } = coordinates(event);
    drawing.move(x, y);
  });
  function endStroke(event?: PointerEvent) {
    if (activePointer === null || (event && event.pointerId !== activePointer)) return;
    const pointer = activePointer;
    activePointer = null;
    drawing.end();
    if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  }
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
    canvas.addEventListener(name, endStroke);
  }
  window.addEventListener("blur", () => endStroke());
  window.addEventListener("resize", () => {
    endStroke();
    drawing.resize();
  });
  save.addEventListener("click", () => {
    endStroke();
    const saved = drawing.save();
    if (!saved) return;
    element("settings", HTMLInputElement).value = JSON.stringify(saved.settings);
    element("new_drawing", HTMLInputElement).value = saved.png;
    form.submit();
  });
  newDrawing.addEventListener("click", () => {
    window.location.href = data.homeUrl;
  });
  window.addEventListener("pagehide", () => stopHint(), { once: true });
}

void initialize().catch((error: unknown) => {
  console.error("Unable to initialize drawing", error);
  const message = document.createElement("p");
  message.id = "error";
  message.textContent = "Unable to load the drawing. Please reload the page.";
  document.body.append(message);
});
