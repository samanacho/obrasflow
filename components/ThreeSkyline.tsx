"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDTO, ProjectType } from "@/lib/types";

const TYPE_HEX: Record<ProjectType, number> = { civil: 0x2c4a6e, electrico: 0xa4780f, vial: 0x6b7785, otro: 0x6b3fa0 };

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

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(isDark ? 0x1a1d21 : 0xf4f6f9);
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
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.9;
      controls.minDistance = 6;
      controls.maxDistance = 26;
      controls.maxPolarAngle = Math.PI / 2.1;

      scene.add(new THREE.AmbientLight(0xffffff, isDark ? 0.5 : 0.7));
      const sun = new THREE.DirectionalLight(0xffffff, isDark ? 0.6 : 0.9);
      sun.position.set(8, 14, 6);
      scene.add(sun);

      const groundGeo = new THREE.PlaneGeometry(40, 40);
      const groundMat = new THREE.MeshStandardMaterial({ color: isDark ? 0x25292e : 0xe4e7ec, roughness: 1 });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      scene.add(ground);
      const grid = new THREE.GridHelper(40, 40, isDark ? 0x3c4148 : 0xc7cbd1, isDark ? 0x2c3036 : 0xd8dbe0);
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
          emissive: overBudget ? new THREE.Color(0xb3392f) : new THREE.Color(0x000000),
          emissiveIntensity: overBudget ? 0.35 : 0,
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
