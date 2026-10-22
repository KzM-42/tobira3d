// 描画：ACES トーンマップ、影、霧、ポストプロセス（AO・ブルーム・SMAA・グレイン・ビネット・色収差）
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Quality } from "./kit";

const FinalShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, grain: { value: 0.045 }, vignette: { value: 0.9 }, ca: { value: 0.0035 }, dark: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, grain, vignette, ca, dark; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - d * ca * r2 * 4.0).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + d * ca * r2 * 4.0).b;
      float v = smoothstep(0.85, 0.12, r2 * 2.2);
      col *= mix(1.0, v, vignette);
      float n = h(gl_FragCoord.xy * 0.731 + fract(time * 13.7) * 91.0) - 0.5;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col += n * grain * (0.55 + 0.45 * (1.0 - lum));
      col *= 1.0 - dark;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private gtao: GTAOPass;
  private bloom: UnrealBloomPass;
  private smaa: SMAAPass;
  private final: ShaderPass;
  quality: Quality = "high";
  exposure = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.04, 60);
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.05);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const w = innerWidth, h = innerHeight;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, w, h);
    this.gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 });
    this.gtao.blendIntensity = 0.85;
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    addEventListener("resize", this.onResize);
  }

  private onResize = () => this.resize();

  dispose() {
    removeEventListener("resize", this.onResize);
    this.composer.dispose();
    this.renderer.dispose();
  }

  setQuality(q: Quality) {
    this.quality = q;
    const dpr = devicePixelRatio || 1;
    const ratio = q === "high" ? Math.min(dpr, 2) : q === "medium" ? Math.min(dpr, 1.5) : Math.min(dpr, 1) * (innerWidth < 900 ? 0.85 : 1);
    this.renderer.setPixelRatio(ratio);
    this.gtao.enabled = q === "high";
    this.bloom.enabled = q !== "low";
    this.smaa.enabled = q !== "low";
    this.renderer.shadowMap.enabled = q !== "low";
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 80 : 72;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  setRoomLook(fog: { color: number; density: number }, env: number, exposure: number) {
    (this.scene.fog as THREE.FogExp2).color.set(fog.color);
    (this.scene.fog as THREE.FogExp2).density = fog.density;
    this.scene.environmentIntensity = env;
    this.exposure = exposure;
  }

  render(time: number, dark: number, exposureMul: number) {
    this.renderer.toneMappingExposure = this.exposure * exposureMul;
    this.final.uniforms.time.value = time;
    this.final.uniforms.dark.value = dark;
    this.composer.render();
  }
}
