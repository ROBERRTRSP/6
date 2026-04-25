import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import * as THREE from "three";
import type { Face } from "./types";

type Props = {
  dice: Face[];
  rolling: boolean;
  jackpot: boolean;
  attract: boolean;
  winningFaces: Face[];
  settled: boolean;
};

const FACE_VALUES: Face[] = [1, 2, 3, 4, 5, 6];

function dieMaterialsWithTopFace(topFace: Face, textures: THREE.CanvasTexture[], highlighted = false) {
  const sideFaces = FACE_VALUES.filter((face) => face !== topFace);
  const materialFaces: Face[] = [
    sideFaces[0],
    sideFaces[1],
    topFace,
    sideFaces[2],
    sideFaces[3],
    sideFaces[4],
  ];

  return materialFaces.map(
    (face) =>
      new THREE.MeshPhysicalMaterial({
        map: textures[face - 1],
        roughness: 0.22,
        metalness: 0.04,
        clearcoat: 0.82,
        clearcoatRoughness: 0.24,
        emissive: highlighted ? new THREE.Color("#7a5200") : new THREE.Color("#000000"),
        emissiveIntensity: highlighted ? 0.16 : 0,
      })
  );
}

function homePosition(cube: THREE.Mesh): THREE.Vector3 {
  const home = cube.userData.homePosition as THREE.Vector3 | undefined;
  return home ?? cube.position.clone();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function makeTexture(face: Face) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, "#fffaf0");
  grad.addColorStop(1, "#d8c7a7");
  ctx.fillStyle = grad;
  roundedRect(ctx, 8, 8, 240, 240, 34);
  ctx.fill();
  ctx.strokeStyle = "rgba(90, 54, 18, .35)";
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = "rgba(207, 159, 48, .9)";
  ctx.lineWidth = 3;
  ctx.stroke();

  const spots: Record<Face, Array<[number, number]>> = {
    1: [[128, 128]],
    2: [
      [82, 82],
      [174, 174],
    ],
    3: [
      [78, 78],
      [128, 128],
      [178, 178],
    ],
    4: [
      [80, 80],
      [176, 80],
      [80, 176],
      [176, 176],
    ],
    5: [
      [76, 76],
      [180, 76],
      [128, 128],
      [76, 180],
      [180, 180],
    ],
    6: [
      [78, 70],
      [178, 70],
      [78, 128],
      [178, 128],
      [78, 186],
      [178, 186],
    ],
  };

  for (const [x, y] of spots[face]) {
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fillStyle = face === 6 ? "#b30b19" : "#111";
    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur = 5;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255, 232, 160, .35)";
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function DiceStage({ dice, rolling, jackpot, attract, winningFaces, settled }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const diceRef = useRef<THREE.Mesh[]>([]);
  const glowRef = useRef<THREE.Mesh[]>([]);
  const textures = useMemo(() => [1, 2, 3, 4, 5, 6].map((v) => makeTexture(v as Face)), []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#08050f");
    scene.fog = new THREE.Fog("#08050f", 7, 16);

    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 5.4, 8.6);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight("#ffe2b0", 1.35);
    const key = new THREE.SpotLight("#fff0cb", 170, 20, Math.PI / 5, 0.32, 1.45);
    key.position.set(-1.2, 8.2, 5.2);
    key.castShadow = true;
    const rim = new THREE.PointLight("#c02cff", 42, 12);
    rim.position.set(-4, 3, 2);
    const goldWash = new THREE.PointLight("#ffc95a", 28, 10);
    goldWash.position.set(3.5, 2.8, 2.5);
    scene.add(ambient, key, rim, goldWash);

    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(5.8, 6.5, 0.38, 96),
      new THREE.MeshStandardMaterial({ color: "#0b3b2a", roughness: 0.7, metalness: 0.02 })
    );
    table.position.y = -0.65;
    table.receiveShadow = true;
    scene.add(table);

    const rail = new THREE.Mesh(
      new THREE.TorusGeometry(5.75, 0.18, 16, 128),
      new THREE.MeshStandardMaterial({ color: "#b78628", roughness: 0.28, metalness: 0.7 })
    );
    rail.position.y = -0.42;
    rail.rotation.x = Math.PI / 2;
    scene.add(rail);

    const led = new THREE.Mesh(
      new THREE.TorusGeometry(5.42, 0.035, 10, 128),
      new THREE.MeshBasicMaterial({ color: "#f6c65a", transparent: true, opacity: 0.5 })
    );
    led.position.y = -0.25;
    led.rotation.x = Math.PI / 2;
    scene.add(led);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    diceRef.current = [];
    glowRef.current = [];
    const positions = [
      [-2.6, 0.15, -0.55],
      [-1.55, 0.15, 0.55],
      [-0.5, 0.15, -0.55],
      [0.55, 0.15, 0.55],
      [1.6, 0.15, -0.55],
      [2.65, 0.15, 0.55],
    ];

    positions.forEach(([x, y, z], index) => {
      const materials = dieMaterialsWithTopFace((index + 1) as Face, textures);
      const cube = new THREE.Mesh(geometry, materials);
      cube.position.set(x, y, z);
      cube.userData.homePosition = cube.position.clone();
      cube.rotation.set(0, (index % 4) * (Math.PI / 2), 0);
      cube.castShadow = true;
      scene.add(cube);
      diceRef.current.push(cube);

      const glow = new THREE.Mesh(
        new THREE.RingGeometry(0.62, 0.92, 48),
        new THREE.MeshBasicMaterial({
          color: "#ffd166",
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      glow.position.set(x, -0.37, z);
      glow.rotation.x = -Math.PI / 2;
      scene.add(glow);
      glowRef.current.push(glow);
    });

    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      if (attract) {
        scene.rotation.y = Math.sin(Date.now() / 1800) * 0.08;
        diceRef.current.forEach((cube, index) => {
          cube.position.y = 0.25 + Math.sin(Date.now() / 550 + index) * 0.16;
        });
      } else {
        scene.rotation.y *= 0.92;
      }
      renderer.render(scene, camera);
    };
    render();

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frame);
      mount.removeChild(renderer.domElement);
      geometry.dispose();
      glowRef.current.forEach((glow) => glow.geometry.dispose());
      renderer.dispose();
    };
  }, [attract, textures]);

  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;

    const target = settled
      ? { x: 0, y: 4.6, z: 8.4, fov: 46 }
      : rolling
        ? { x: 0, y: 5.8, z: 9.2, fov: 48 }
        : { x: 0, y: 5.4, z: 8.6, fov: 46 };

    gsap.to(camera.position, {
      x: target.x,
      y: target.y,
      z: target.z,
      duration: settled ? 0.85 : 0.45,
      ease: "power2.out",
      onUpdate: () => camera.lookAt(0, 0, 0),
    });
    gsap.to(camera, {
      fov: target.fov,
      duration: settled ? 0.85 : 0.45,
      ease: "power2.out",
      onUpdate: () => camera.updateProjectionMatrix(),
    });
  }, [rolling, settled]);

  useEffect(() => {
    diceRef.current.forEach((cube, index) => {
      const value = dice[index] ?? 1;
      const isWinningDie = settled && winningFaces.includes(value);
      cube.material = dieMaterialsWithTopFace(value, textures, isWinningDie);

      const glow = glowRef.current[index];
      if (glow) {
        const glowMaterial = glow.material as THREE.MeshBasicMaterial;
        const revealDelay = isWinningDie && settled ? index * 0.32 : 0;
        gsap.to(glowMaterial, {
          opacity: isWinningDie ? 0.78 : 0,
          duration: isWinningDie ? 0.5 : 0.18,
          delay: revealDelay,
          ease: "power2.out",
        });
        gsap.to(glow.scale, {
          x: isWinningDie ? 1.18 : 0.72,
          y: isWinningDie ? 1.18 : 0.72,
          z: 1,
          duration: 0.6,
          delay: revealDelay,
          ease: "back.out(1.7)",
        });
      }

      if (rolling) {
        const home = homePosition(cube);
        const launchX = (Math.random() - 0.5) * 1.4;
        const launchZ = -1.1 - Math.random() * 1.2;
        const fallHeight = 3.4 + Math.random() * 1.4;
        const driftX = (Math.random() - 0.5) * 0.6;
        const driftZ = (Math.random() - 0.5) * 0.45;
        const fallDuration = 0.55 + Math.random() * 0.22;
        const spinDuration = 0.85 + Math.random() * 0.45;
        const startDelay = index * 0.45 + Math.random() * 0.05;

        gsap.killTweensOf(cube.rotation);
        gsap.killTweensOf(cube.position);
        gsap.set(cube.position, {
          x: home.x + launchX,
          y: home.y + fallHeight,
          z: home.z + launchZ,
        });
        gsap.set(cube.rotation, {
          x: Math.random() * Math.PI * 2,
          y: Math.random() * Math.PI * 2,
          z: Math.random() * Math.PI * 2,
        });

        gsap.to(cube.rotation, {
          x: `+=${Math.PI * (6 + index + Math.random() * 4)}`,
          y: `+=${Math.PI * (7 + Math.random() * 6)}`,
          z: `+=${Math.PI * (5 + Math.random() * 5)}`,
          duration: spinDuration,
          repeat: -1,
          ease: "none",
          delay: startDelay,
        });
        gsap
          .timeline({ delay: startDelay })
          .to(cube.position, {
            x: home.x + driftX,
            y: home.y,
            z: home.z + driftZ,
            duration: fallDuration,
            ease: "power2.in",
          })
          .to(cube.position, {
            y: home.y + 0.74 + Math.random() * 0.32,
            duration: 0.16 + Math.random() * 0.08,
            ease: "power1.out",
          })
          .to(cube.position, {
            x: home.x + driftX * 0.45,
            y: home.y,
            z: home.z + driftZ * 0.45,
            duration: 0.26 + Math.random() * 0.08,
            ease: "bounce.out",
          })
          .to(cube.position, {
            x: home.x + driftX * 0.22,
            y: home.y + 0.16,
            z: home.z + driftZ * 0.22,
            duration: 0.22 + Math.random() * 0.08,
            yoyo: true,
            repeat: -1,
            ease: "sine.inOut",
          });
      } else {
        gsap.killTweensOf(cube.rotation);
        gsap.killTweensOf(cube.position);
        const home = homePosition(cube);
        const stopDelay = index * 0.18 + Math.random() * 0.05;
        gsap.to(cube.position, {
          x: home.x,
          y: home.y,
          z: home.z,
          duration: 0.42,
          delay: stopDelay,
          ease: "bounce.out",
        });
        gsap.to(cube.rotation, {
          x: Math.PI * 2,
          y: Math.PI * 2 + (index % 4) * (Math.PI / 2),
          z: 0,
          duration: 0.6,
          delay: stopDelay,
          ease: "back.out(1.8)",
        });
      }
    });
  }, [dice, rolling, settled, textures, winningFaces]);

  return (
    <div className={`diceStage ${rolling ? "diceStageRolling" : ""} ${jackpot ? "diceStageJackpot" : ""}`}>
      <div ref={mountRef} className="diceCanvas" />
      <div className="stageLights" />
    </div>
  );
}
