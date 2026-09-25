// Still renders of the 3D stones for the rest of the interface (the HUD goals, the title, the level map, the
// frame crest), so every jewel on screen is the same 3D stone. Rendered once per session, off screen, at a
// resolution that stays sharp on high-density and 4K screens, then the renderer is released.
import * as THREE from 'three';
import { addLights, GemKit } from './gems3d';
import { buildPiece, disposePiece } from './piece3d';

const SIZE = 384;

export function renderGemIcons(): string[] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  addLights(scene);
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 20);
  camera.position.z = 5;
  const kit = new GemKit(renderer);
  const urls: string[] = [];
  for (let kind = 0; kind < 6; kind++) {
    const piece = buildPiece(kit, kind, null);
    piece.glow.material.opacity = 0.3;
    if (piece.sparkle) piece.sparkle.visible = false;
    piece.body.rotation.set(-0.4, 0.22, 0);
    piece.body.scale.setScalar(1.12);
    scene.add(piece.root);
    renderer.render(scene, camera);
    urls.push(canvas.toDataURL('image/png'));
    disposePiece(piece);
  }
  kit.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return urls;
}
