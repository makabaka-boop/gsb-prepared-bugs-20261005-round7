const input = document.querySelector("#scene"),
  canvas = document.querySelector("#view"),
  output = document.querySelector("#evidence");
const renderer = new LayerProof.Renderer(canvas);
input.value = JSON.stringify(
  {
    width: 3,
    height: 2,
    background: [32, 32, 32],
    lut: Array.from(Proof.makeIdentityLut()),
    layers: [
      {
        id: "sample",
        x: 1,
        y: 0,
        opacity: 0.5,
        grid: { width: 1, height: 2, data: [255, 0, 0, 255, 0, 0, 255, 128] },
      },
    ],
  },
  null,
  2,
);
function update() {
  try {
    renderer.setScene(JSON.parse(input.value));
    inspect();
  } catch (e) {
    output.textContent = e.message;
  }
}
function inspect() {
  if (renderer.current)
    output.textContent = JSON.stringify(
      {
        gpu: renderer.state,
        pixel: LayerProof.pixel(
          renderer.current,
          +document.querySelector("#x").value,
          +document.querySelector("#y").value,
        ),
      },
      null,
      2,
    );
}
document.querySelector("#apply").onclick = update;
for (const id of ["x", "y"]) document.querySelector("#" + id).oninput = inspect;
document.querySelector("#loss").onclick = () =>
  renderer.gl.getExtension("WEBGL_lose_context").loseContext();
document.querySelector("#restore").onclick = () =>
  renderer.gl.getExtension("WEBGL_lose_context").restoreContext();
document.querySelector("#export").onclick = () => {
  const s = renderer.current,
    r = LayerProof.renderCpu(s),
    url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify({
            width: s.width,
            height: s.height,
            bytes: Array.from(r.bytes),
            gamut: Array.from(r.gamut),
            pixels: Array.from({ length: s.width * s.height }, (_, i) =>
              LayerProof.pixel(s, i % s.width, Math.floor(i / s.width)),
            ),
          }),
        ],
        { type: "application/json" },
      ),
    );
  const a = document.createElement("a");
  a.href = url;
  a.download = "layer-proof.json";
  a.click();
  URL.revokeObjectURL(url);
};
update();
