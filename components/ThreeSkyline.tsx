"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDTO, ProjectType } from "@/lib/types";

// Misma paleta apagada/cálida que el resto del sitio (app/globals.css) —
// nada de colores saturados ni de neón, para que el skyline no desentone.
const TYPE_HEX_LIGHT: Record<ProjectType, number> = { civil: 0x4a6b85, electrico: 0xa9803d, vial: 0x726c61, otro: 0x8172a3 };
const TYPE_HEX_DARK: Record<ProjectType, number> = { civil: 0x8ca9c2, electrico: 0xd3af6e, vial: 0xb3ac9e, otro: 0xb3a4cc };
const CRIT_LIGHT = 0xa0564d;
const CRIT_DARK = 0xc98980;

/**
 * "Skyline" 3D de la cartera de obras — cada proyecto es un edificio: la
 * altura representa el avance (%), el color el rubro, y el borde superior se
 * ilumina en rojo si está sobre presupuesto. Es la idea que más aprovecha
 * Three.js acá: nada de esto se puede expresar con un chart 2D, y el propio
 * "skyline de edificios" conecta directo con el tema de la app (obras).
 * Rota sola, se puede orbitar con el mouse, y clickear un edificio navega
 * al proyecto.
 */
export default function ThreeSkyline({ projects }: { projects: ProjectDTO[] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!mountRef.current || projects.length === 0) return;
    let disposed = false;
    let frameId = 0;
    const mount = mountRef.current;

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed || !mount) return;

      const isDark = document.documentElement.getAttribute("data-coreui-theme") === "dark";
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const TYPE_HEX = isDark ? TYPE_HEX_DARK : TYPE_HEX_LIGHT;
      const critHex = isDark ? CRIT_DARK : CRIT_LIGHT;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(isDark ? 0x221f1b : 0xf5f3ee);
      scene.fog = new THREE.Fog(scene.background.getHex(), 18, 40);

      const width = mount.clientWidth || 400;
      const height = 320;
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.set(9, 8, 12);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      mount.innerHTML = "";
      mount.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 1, 0);
      controls.enableDamping = true;
      // Sin autorrotación si el usuario pidió menos movimiento (prefers-reduced-motion) —
      // un edificio orbitando solo puede ser distractivo/incómodo para ese perfil.
      controls.autoRotate = !reducedMotion;
      controls.autoRotateSpeed = 0.6;
      controls.minDistance = 6;
      controls.maxDistance = 26;
      controls.maxPolarAngle = Math.PI / 2.1;

      scene.add(new THREE.AmbientLight(0xffffff, isDark ? 0.5 : 0.7));
      const sun = new THREE.DirectionalLight(0xffffff, isDark ? 0.6 : 0.9);
      sun.position.set(8, 14, 6);
      scene.add(sun);

      const groundGeo = new THREE.PlaneGeometry(40, 40);
      const groundMat = new THREE.MeshStandardMaterial({ color: isDark ? 0x2b2823 : 0xebe7df, roughness: 1 });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      scene.add(ground);
      const grid = new THREE.GridHelper(40, 40, isDark ? 0x3d3930 : 0xcfc9bc, isDark ? 0x322f28 : 0xe1ddd3);
      scene.add(grid);

      const cols = Math.ceil(Math.sqrt(projects.length));
      const spacing = 2.2;
      const buildings: { mesh: any; id: string }[] = [];

      projects.forEach((p, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = (col - (cols - 1) / 2) * spacing;
        const z = (row - (cols - 1) / 2) * spacing;
        const h = Math.max(0.3, (p.progress / 100) * 6);
        const geo = new THREE.BoxGeometry(1, h, 1);
        const overBudget = p.spent > p.budget;
        const mat = new THREE.MeshStandardMaterial({
          color: TYPE_HEX[p.type],
          emissive: overBudget ? new THREE.Color(critHex) : new THREE.Color(0x000000),
          emissiveIntensity: overBudget ? 0.3 : 0,
          roughness: 0.55,
          metalness: 0.1,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, h / 2, z);
        mesh.userData.projectId = p.id;
        scene.add(mesh);
        buildings.push({ mesh, id: p.id });
      });

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      function onClick(e: MouseEvent) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(buildings.map((b) => b.mesh))[0];
        if (hit) router.push(`/project/${(hit.object as any).userData.projectId}`);
      }
      renderer.domElement.style.cursor = "grab";
      renderer.domElement.addEventListener("click", onClick);

      function animate() {
        if (disposed) return;
        controls.update();
        renderer.render(scene, camera);
        frameId = requestAnimationFrame(animate);
      }
      animate();

      const resizeObserver = new ResizeObserver(() => {
        if (!mount) return;
        const w = mount.clientWidth || 400;
        camera.aspect = w / height;
        camera.updateProjectionMatrix();
        renderer.setSize(w, height);
      });
      resizeObserver.observe(mount);

      (mount as any)._cleanup = () => {
        resizeObserver.disconnect();
        renderer.domElement.removeEventListener("click", onClick);
        controls.dispose();
        buildings.forEach((b) => { b.mesh.geometry.dispose(); (b.mesh.material as any).dispose(); });
        groundGeo.dispose();
        groundMat.dispose();
        renderer.dispose();
      };
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      (mount as any)?._cleanup?.();
      if (mount) mount.innerHTML = "";
    };
  }, [projects, router]);

  if (projects.length === 0) {
    return <p className="empty-col">Sin proyectos todavía para el skyline.</p>;
  }

  return <div ref={mountRef} className="of-skyline" title="Arrastrá para rotar · clic en un edificio para abrir el proyecto" />;
}
