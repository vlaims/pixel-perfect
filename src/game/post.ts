// @ts-nocheck
import * as THREE from "three";

/**
 * Single-pass port of the uploaded ReShade preset:
 * LumaSharpen (0.65 / clamp 0.035) + qUINT sharpen, Curves (contrast -0.8, soft),
 * DPX (strength 0.1), Technicolor2 (brightness 1.25, strength 0.8 scaled), Vibrance 1.0.
 */
export class PostPass {
  target: THREE.WebGLRenderTarget;
  scene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  mat: THREE.ShaderMaterial;

  constructor(w: number, h: number) {
    this.target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.target.texture }, texel: { value: new THREE.Vector2(1 / w, 1 / h) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec2 texel; varying vec2 vUv;
        const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
        vec3 toSRGB(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
        vec3 tex(vec2 o){ return toSRGB(texture2D(tDiffuse, vUv + o).rgb); }
        void main(){
          vec3 c = tex(vec2(0.0));
          // LumaSharpen (pattern 1, strength 0.65, clamp 0.035)
          vec3 blur = (tex(texel*vec2(0.5,-0.5)) + tex(texel*vec2(-0.5,0.5)) + tex(texel*vec2(0.5,0.5)) + tex(texel*vec2(-0.5,-0.5))) * 0.25;
          float sh = dot(c - blur, LW * 0.65 * 1.5);
          c += clamp(sh, -0.035, 0.035);
          // DPX (strength 0.1)
          vec3 dpx = 1.0 / (1.0 + exp(8.0 * (vec3(0.36,0.36,0.34) - c)));
          c = mix(c, dpx, 0.1);
          // Technicolor2 (brightness 1.25, saturation 1.0) at reduced strength
          vec3 tc = c * 1.12;
          float l = dot(tc, LW);
          c = mix(c, mix(vec3(l), tc, 1.05), 0.55);
          // Vibrance 1.0
          float mx = max(c.r, max(c.g, c.b)); float mn = min(c.r, min(c.g, c.b));
          float sat = mx - mn; float lum = dot(c, LW);
          c = mix(vec3(lum), c, 1.0 + 0.55 * (1.0 - sign(1.0) * sat));
          // Curves (contrast -0.8 -> softened S-curve)
          vec3 s = c * c * (3.0 - 2.0 * c);
          c = mix(c, s, -0.18);
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setSize(w: number, h: number) {
    this.target.setSize(w, h);
    (this.mat.uniforms.texel.value as THREE.Vector2).set(1 / w, 1 / h);
  }

  render(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera) {
    r.setRenderTarget(this.target);
    r.render(scene, cam);
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
