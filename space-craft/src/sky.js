// 宇宙の空: 星空・太陽・遠景の惑星
import * as THREE from 'three';

export function buildSky(scene) {
  // 背景色（深い宇宙）
  scene.background = new THREE.Color(0x05060f);
  scene.fog = new THREE.Fog(0x0a0b1a, 40, 160);

  // 星空（Points）
  const starCount = 2500;
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    // 大きな球殻上にランダム配置
    const r = 400;
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    sp[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    sp[i * 3 + 1] = r * Math.cos(phi) * 0.6 + 60; // やや上寄り
    sp[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 1.6, sizeAttenuation: false, depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  // 太陽（強い指向性光 + 円盤）
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.4);
  sun.position.set(80, 120, 40);
  scene.add(sun);

  const sunDisk = new THREE.Mesh(
    new THREE.SphereGeometry(18, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0 })
  );
  sunDisk.position.copy(sun.position).multiplyScalar(2.4);
  scene.add(sunDisk);

  // 環境光（影を真っ黒にしない）
  scene.add(new THREE.AmbientLight(0x4a5070, 0.9));
  // 下からの淡い反射光
  const hemi = new THREE.HemisphereLight(0x8899ff, 0x331a2a, 0.5);
  scene.add(hemi);

  // 遠景の惑星（リング付き）
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(60, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0x6a4ea0, roughness: 1, metalness: 0 })
  );
  planet.position.set(-260, 130, -300);
  scene.add(planet);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(80, 120, 64),
    new THREE.MeshBasicMaterial({ color: 0xb088d8, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
  );
  ring.rotation.x = Math.PI / 2.4;
  ring.position.copy(planet.position);
  scene.add(ring);

  // 小さな衛星
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(22, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0x9fb0c8, roughness: 1 })
  );
  moon.position.set(220, 90, -200);
  scene.add(moon);

  return { stars, sun, sunDisk, planet, ring, moon };
}
