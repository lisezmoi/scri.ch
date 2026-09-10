const form = document.querySelector<HTMLFormElement>("#stats-form")!;
const year = document.querySelector<HTMLSelectElement>("#stats-year")!;
year.addEventListener("change", () => form.requestSubmit());
document.querySelector<HTMLButtonElement>("#stats-go")!.hidden = true;

const graph = document.querySelector<SVGSVGElement>("#stats-graph");
if (graph) {
  const points: { date: string; count: number; }[] = JSON.parse(
    document.querySelector("#stats-data")!.textContent!,
  );
  const marker = document.querySelector<SVGLineElement>("#stats-marker")!;
  const readout = document.querySelector<HTMLElement>("#stats-readout")!;
  let selected = 0;
  graph.setAttribute("role", "slider");
  graph.setAttribute("tabindex", "0");
  graph.setAttribute("aria-label", "Drawing counts by date");
  graph.setAttribute(
    "aria-description",
    "Use left/right arrows to select a date, or Home and End to jump to the first and last dates.",
  );
  graph.setAttribute("aria-orientation", "horizontal");
  graph.setAttribute("aria-valuemin", "0");
  graph.setAttribute("aria-valuemax", String(points.length - 1));
  const select = (index: number) => {
    selected = Math.max(0, Math.min(points.length - 1, index));
    const point = points[selected]!;
    const text = `${point.date}: ${point.count.toLocaleString("en-GB")} drawings`;
    readout.textContent = text;
    graph.setAttribute("aria-valuenow", String(selected));
    graph.setAttribute("aria-valuetext", text);
    const x = String((selected + .5) * 1000 / points.length);
    marker.setAttribute("x1", x);
    marker.setAttribute("x2", x);
    marker.setAttribute("visibility", "visible");
  };
  graph.setAttribute("aria-valuenow", "0");
  graph.setAttribute("aria-valuetext", `${points[0]!.date}: ${points[0]!.count} drawings`);
  graph.addEventListener("pointermove", event => {
    if (event.pointerType === "touch") return;
    const box = graph.getBoundingClientRect();
    select(Math.floor((event.clientX - box.left) / box.width * points.length));
  });
  graph.addEventListener("click", event => {
    const box = graph.getBoundingClientRect();
    select(Math.floor((event.clientX - box.left) / box.width * points.length));
  });
  graph.addEventListener("focus", () => select(selected));
  graph.addEventListener("keydown", event => {
    const target = {
      ArrowLeft: selected - 1,
      ArrowRight: selected + 1,
      Home: 0,
      End: points.length - 1,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(target);
  });
}
