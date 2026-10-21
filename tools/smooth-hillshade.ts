import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/**
 * Smooth sun shading: a small build-time change to MapLibre GL.
 *
 * MapLibre works out the shading in two passes. The first stores each pixel's slope in a texture,
 * the second lights it. That texture holds 8 bits per channel, so slopes come in 256 steps, and on
 * the Moon's smooth, gentle slopes each step shows as a ring or a flat patch. This patch:
 *  1. gives the slope texture floating-point channels instead: 32-bit where the graphics card can,
 *     otherwise 16-bit (as MapLibre already uses for heatmaps);
 *  2. has the lighting pass read it at high precision ("mediump", MapLibre's default, is only about
 *     10 bits on many phones and Macs, which brings the steps back).
 * Light and shadow then fade smoothly.
 *
 * If the browser can't draw into such a texture, MapLibre's own 8-bit texture is kept. If a newer
 * MapLibre no longer matches, the build warns and the app works as before, just with the steps.
 */

// In prepareHillshade: the slope texture is made, then bound with its filter and attached to the tile's framebuffer.
const TARGET =
  /const (\w+)=new ([\w$.]+)\((\w+),\{width:(\w+),height:\4,data:null\},(\w+)\.RGBA\);\1\.bind\(([\w$]+),\5\.CLAMP_TO_EDGE\),([\w$]+)=([\w$]+)\.fbo=\3\.createFramebuffer\(\4,\4,!0,!1\)/;

/**
 * The finest texture format this WebGL context can draw into and read back smoothly: 32-bit float
 * (desktop GPUs, needs float filtering) or 16-bit float, as [internal format, type]; or false.
 * Tested once per context; the texture and framebuffer that were bound are bound again afterwards
 * (read from WebGL itself: MapLibre's own record of them isn't always up to date).
 */
const BEST = `function(x,g){if(x.__smoothShade===void 0){x.__smoothShade=!1;const ok=(f,t)=>{const t0=g.getParameter(g.TEXTURE_BINDING_2D),f0=g.getParameter(g.FRAMEBUFFER_BINDING),tx=g.createTexture(),fb=g.createFramebuffer();g.bindTexture(g.TEXTURE_2D,tx);g.texImage2D(g.TEXTURE_2D,0,f,4,4,0,g.RGBA,t,null);g.bindFramebuffer(g.FRAMEBUFFER,fb);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,tx,0);const r=g.checkFramebufferStatus(g.FRAMEBUFFER)===g.FRAMEBUFFER_COMPLETE;g.bindFramebuffer(g.FRAMEBUFFER,f0);g.bindTexture(g.TEXTURE_2D,t0);g.deleteFramebuffer(fb);g.deleteTexture(tx);return r};try{if(g.RGBA32F&&g.getExtension("EXT_color_buffer_float")&&g.getExtension("OES_texture_float_linear")&&ok(g.RGBA32F,g.FLOAT))x.__smoothShade=[g.RGBA32F,g.FLOAT];else if(x.HALF_FLOAT&&x.RGBA16F&&ok(x.RGBA16F,x.HALF_FLOAT))x.__smoothShade=[x.RGBA16F,x.HALF_FLOAT];}catch(e){}}return x.__smoothShade}`;

/** The start of the lighting pass's fragment shader (precision defaults are added before it when it is compiled). */
const LIGHTING = "uniform sampler2D u_image;in vec2 v_pos;uniform vec2 u_latrange;";
// WebGL2 shaders (version 300) always have highp; WebGL1 ones only when the device says so. (Some
// WebGL2 drivers leave GL_FRAGMENT_PRECISION_HIGH undefined, so it can't be the only test.)
const HIGH = "\\n#if __VERSION__ >= 300 || defined(GL_FRAGMENT_PRECISION_HIGH)\\nprecision highp float;\\nprecision highp sampler2D;\\n#endif\\n";

export function patchHillshade(code: string): string | null {
  const m = TARGET.exec(code);
  if (!m || code.split(LIGHTING).length !== 2) return null;
  const [all, tex, , ctx, size, gl] = m;
  // right after the texture is made: bind it (WebGL and MapLibre agree on that again afterwards) and give it the finer format
  const float = `(${BEST})(${ctx},${gl})&&(${gl}.bindTexture(${gl}.TEXTURE_2D,${tex}.texture),${gl}.texImage2D(${gl}.TEXTURE_2D,0,${ctx}.__smoothShade[0],${size},${size},0,${gl}.RGBA,${ctx}.__smoothShade[1],null));`;
  const at = all.indexOf(";") + 1;
  return code.replace(all, () => all.slice(0, at) + float + all.slice(at)).replace(LIGHTING, () => HIGH + LIGHTING);
}

const FILE = /maplibre-gl[\\/]dist[\\/]maplibre-gl(-dev)?\.js$/;

/** The Vite plugin: patches MapLibre in the production build and in the dev server's prebundle. */
export function smoothHillshade(): Plugin {
  const patch = (code: string, warn: (m: string) => void) => {
    const out = patchHillshade(code);
    if (!out) warn("smooth-hillshade: MapLibre's hillshade code has changed; shading stays 8-bit (fine, slightly stepped).");
    return out ?? code;
  };
  return {
    name: "smooth-hillshade",
    enforce: "pre",
    config: () => ({
      optimizeDeps: {
        esbuildOptions: {
          plugins: [
            {
              name: "smooth-hillshade",
              setup(build) {
                build.onLoad({ filter: FILE }, (args) => ({ contents: patch(readFileSync(args.path, "utf8"), console.warn), loader: "js" }));
              },
            },
          ],
        },
      },
    }),
    transform(code, id) {
      if (id.includes("?") || !FILE.test(id)) return null; // ?commonjs-… ids are Vite's wrappers around the same file
      return { code: patch(code, (m) => this.warn(m)), map: null };
    },
  };
}
