"use strict";
const LayerProof = (() => {
  const P =
    typeof module !== "undefined" ? require("./proof.js") : window.Proof;
  function scene(value) {
    const v = typeof value === "string" ? JSON.parse(value) : value;
    const size = (n) => Number.isInteger(n) && n >= 1 && n <= 128;
    if (
      !v ||
      !size(v.width) ||
      !size(v.height) ||
      !Array.isArray(v.background) ||
      v.background.length !== 3 ||
      v.background.some((n) => !Number.isInteger(n) || n < 0 || n > 255) ||
      !Array.isArray(v.layers) ||
      v.layers.length > 4
    )
      throw Error("Invalid layer scene");
    const ids = new Set();
    const layers = v.layers.map((l) => {
      if (
        !l ||
        typeof l.id !== "string" ||
        !l.id ||
        ids.has(l.id) ||
        !Number.isInteger(l.x) ||
        !Number.isInteger(l.y) ||
        !Number.isFinite(l.opacity) ||
        l.opacity < 0 ||
        l.opacity > 1
      )
        throw Error("Invalid layer");
      ids.add(l.id);
      return { ...l, grid: P.parseGrid(l.grid) };
    });
    return {
      width: v.width,
      height: v.height,
      background: v.background.slice(),
      lut: P.parseLut({ entries: Array.from(v.lut) }),
      layers,
    };
  }
  function pixel(s, x, y) {
    let linear = P.backgroundLinear(s.background);
    const evidence = [];
    for (const layer of s.layers) {
      const a = x - layer.x,
        b = y - layer.y;
      if (a < 0 || b < 0 || a >= layer.grid.width || b >= layer.grid.height)
        continue;
      const i = (b * layer.grid.width + a) * 4;
      const v = P.evaluatePixel(
        layer.grid.bytes.subarray(i, i + 4),
        s.lut,
        [0, 0, 0],
      );
      const alpha = v.alpha * layer.opacity;
      linear = linear.map((n, c) =>
        P.decodeSrgb(
          (alpha * P.encodeToByte(v.srgbLinear[c]) +
            (1 - alpha) * P.encodeToByte(n)) /
            255,
        ),
      );
      evidence.push({
        id: layer.id,
        alpha,
        linear: v.srgbLinear,
        visibleWeight: 0,
        gamut: v.outOfGamutBeforeComposite,
      });
    }
    let remaining = 1;
    for (let i = evidence.length - 1; i >= 0; i--) {
      evidence[i].visibleWeight = evidence[i].alpha * remaining;
      remaining *= 1 - evidence[i].alpha;
    }
    return {
      linear,
      evidence,
      backgroundWeight: remaining,
      output: [...linear.map(P.encodeToByte), 255],
      gamut: evidence.some((e) => e.visibleWeight > 0 && e.gamut),
    };
  }
  function renderCpu(s) {
    const bytes = new Uint8ClampedArray(s.width * s.height * 4),
      gamut = new Uint8Array(s.width * s.height);
    for (let y = 0; y < s.height; y++)
      for (let x = 0; x < s.width; x++) {
        const p = pixel(s, x, y);
        bytes.set(p.output, (y * s.width + x) * 4);
        gamut[y * s.width + x] = p.gamut ? 1 : 0;
      }
    return { bytes, gamut, width: s.width, height: s.height };
  }
  let fragment = P.fragmentSource
    .split("void main()")[0]
    .replace(
      "uniform highp usampler2D uInput;",
      "uniform highp usampler2D uInput[4];\nuniform vec4 uRects[4];\nuniform float uOpacity[4];\nuniform int uCount;\nuniform vec2 uSize;",
    );
  fragment += `
vec3 convertColor(vec3 inputColor){
mat3 toP3=mat3(0.8224619687143623,0.03319419885096169,0.01708263072111998,0.1775380312856375,0.9668058011490383,0.07239744066396345,0.0,0.0,0.9105199286149166);
mat3 toSrgb=mat3(1.2249401762805598,-0.04205695470968825,-0.019637554590334356,-0.22494017628055962,1.0420569547096883,-0.07863604555063188,0.0,0.0,1.0982736001409663);
return toSrgb*tetraLookup(clamp(toP3*decodeSrgb(inputColor),0.0,1.0));
}
void main(){vec2 position=vec2(gl_FragCoord.x,uSize.y-gl_FragCoord.y);vec3 acc=uBackground;`;
  for (let i = 0; i < 4; i++)
    fragment += `
if(uCount>${i}){vec2 p=position-uRects[${i}].xy;if(all(greaterThanEqual(p,vec2(0.0)))&&all(lessThan(p,uRects[${i}].zw))){uvec4 raw=texelFetch(uInput[${i}],ivec2(p),0);float a=float(raw.a)/255.0*uOpacity[${i}];acc=a*convertColor(vec3(raw.rgb)/255.0)+(1.0-a)*acc;}}
`;
  fragment += "outColor=vec4(clamp(encodeSrgb(acc),0.0,1.0),1.0);}";
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.current = null;
      this.bytes = null;
      this.state = "initial";
      canvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        this.state = "lost";
        this.bytes = null;
      });
      canvas.addEventListener("webglcontextrestored", () => {
        this.initialize();
        if (this.current) this.draw();
      });
      this.initialize();
    }
    initialize() {
      const g = this.canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
      });
      if (!g) throw Error("WebGL2 unavailable");
      this.gl = g;
      const p = g.createProgram();
      g.attachShader(p, P.compileShader(g, g.VERTEX_SHADER, P.vertexSource));
      g.attachShader(p, P.compileShader(g, g.FRAGMENT_SHADER, fragment));
      g.linkProgram(p);
      if (!g.getProgramParameter(p, g.LINK_STATUS))
        throw Error(g.getProgramInfoLog(p));
      this.program = p;
      this.textures = Array.from({ length: 4 }, () => g.createTexture());
      this.state = "ready";
    }
    setScene(value) {
      if (this.state === "lost") return null;
      this.current = scene(value);
      this.bytes = null;
      return this.draw();
    }
    draw() {
      const s = this.current,
        g = this.gl;
      if (!s || g.isContextLost()) return null;
      this.canvas.width = s.width;
      this.canvas.height = s.height;
      g.viewport(0, 0, s.width, s.height);
      g.useProgram(this.program);
      g.disable(g.BLEND);
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
      const rects = new Float32Array(16),
        opacity = new Float32Array(4);
      for (let i = 0; i < 4; i++) {
        const l = s.layers[i];
        g.activeTexture(g.TEXTURE0 + i);
        g.bindTexture(g.TEXTURE_2D, this.textures[i]);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
        g.texImage2D(
          g.TEXTURE_2D,
          0,
          g.RGBA8UI,
          l ? l.grid.width : 1,
          l ? l.grid.height : 1,
          0,
          g.RGBA_INTEGER,
          g.UNSIGNED_BYTE,
          l ? l.grid.bytes : new Uint8Array(4),
        );
        if (l) {
          rects.set([l.y, l.x, l.grid.width, l.grid.height], i * 4);
          opacity[i] = l.opacity;
        }
      }
      const at = (n) => g.getUniformLocation(this.program, n);
      g.uniform1iv(at("uInput[0]"), [0, 1, 2, 3]);
      g.uniform4fv(at("uRects[0]"), rects);
      g.uniform1fv(at("uOpacity[0]"), opacity);
      g.uniform1i(at("uCount"), s.layers.length);
      g.uniform2f(at("uSize"), s.width, s.height);
      g.uniform3fv(at("uLut[0]"), new Float32Array(s.lut));
      g.uniform3fv(at("uBackground"), P.backgroundLinear(s.background));
      g.drawArrays(g.TRIANGLES, 0, 3);
      const raw = new Uint8Array(s.width * s.height * 4);
      g.readPixels(0, 0, s.width, s.height, g.RGBA, g.UNSIGNED_BYTE, raw);
      if (g.getError() !== g.NO_ERROR) throw Error("Layer rendering GL error");
      this.bytes = P.flipRowsRGBA(raw, s.width, s.height);
      return this.bytes;
    }
  }
  return { scene, pixel, renderCpu, Renderer };
})();
if (typeof module !== "undefined") module.exports = LayerProof;
else window.LayerProof = LayerProof;
