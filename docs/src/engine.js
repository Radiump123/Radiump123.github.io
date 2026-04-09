/** ENGINE DATA **/
const WEAPONS = [
  { name: "SIDEARM", mag: 12, res: 48, rate: 250, auto: false, spread: 0.01, unlocked: true },
  { name: "SMG-V", mag: 30, res: 90, rate: 90, auto: true, spread: 0.05, unlocked: true },
  { name: "SHREDDER", mag: 6, res: 24, rate: 800, auto: false, spread: 0.15, unlocked: true }
];

let scene, camera, renderer, clock, gunGroup, radarCtx;
let world = { walls: [], enemies: [], bullets: [], particles: [], loots: [] };
let player = { hp: 100, velY: 0, grounded: true, wIdx: 0, ammo: [12,30,6], res: [48,90,24], lastRegen: 0 };
let keys = {}, running = false, initialized = false;
let yaw = 0, pitch = 0, isAds = false, isShooting = false, lastShot = 0;

// Wait for script to load
window.onload = () => {
  document.getElementById('loading-txt').innerText = "SYSTEMS READY";
  document.getElementById('startBtn').addEventListener('click', startRequest);
};

function startRequest() {
  if (!initialized) {
    initEngine();
    initialized = true;
  }
  document.getElementById('wrap').requestPointerLock();
}

function initEngine() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010505);
  scene.fog = new THREE.Fog(0x010505, 1, 45);

  camera = new THREE.PerspectiveCamera(75, 1000/600, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
  renderer.setSize(1000, 600);
  clock = new THREE.Clock();
  radarCtx = document.getElementById('radar-canvas').getContext('2d');

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.1));
  const p1 = new THREE.PointLight(0x00ffcc, 1.5, 20); p1.position.set(0, 5, 0); scene.add(p1);
  const p2 = new THREE.PointLight(0xff0055, 1.2, 20); p2.position.set(20, 5, 20); scene.add(p2);

  // Floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshPhongMaterial({color: 0x050505}));
  floor.rotation.x = -Math.PI/2;
  scene.add(floor);

  // Map
  addWall(0, 2, -30, 60, 4, 1);  addWall(0, 2, 30, 60, 4, 1);
  addWall(-30, 2, 0, 1, 4, 60);  addWall(30, 2, 0, 1, 4, 60);
  addWall(-10, 2, -10, 1, 4, 15); addWall(10, 2, 10, 1, 4, 15);

  // Gun
  gunGroup = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.5), new THREE.MeshPhongMaterial({color: 0x111111}));
  gunGroup.add(body);
  camera.add(gunGroup);
  scene.add(camera);

  // Listeners
  document.addEventListener('keydown', e => { 
    keys[e.code] = true; 
    if(e.code === 'KeyR') reload();
    if(e.code === 'Digit1') switchWeapon(0);
    if(e.code === 'Digit2') switchWeapon(1);
    if(e.code === 'Digit3') switchWeapon(2);
  });
  document.addEventListener('keyup', e => keys[e.code] = false);
  document.addEventListener('mousedown', e => { 
    if(e.button === 0) isShooting = true; 
    if(e.button === 2) isAds = true; 
  });
  document.addEventListener('mouseup', e => { 
    if(e.button === 0) isShooting = false; 
    if(e.button === 2) isAds = false; 
  });
  document.addEventListener('mousemove', e => {
    if(!running) return;
    yaw -= e.movementX * 0.002;
    pitch -= e.movementY * 0.002;
    pitch = Math.max(-1.5, Math.min(1.5, pitch));
  });

  document.addEventListener('pointerlockchange', () => {
    running = !!document.pointerLockElement;
    document.getElementById('overlay').style.display = running ? 'none' : 'flex';
  });

  requestAnimationFrame(loop);
}

function addWall(x,y,z,w,h,d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshPhongMaterial({color: 0x0a0a0a}));
  m.position.set(x,y,z);
  scene.add(m);
  world.walls.push({ box: new THREE.Box3().setFromObject(m), x, z, w, d });
}

function checkCol(pos) {
  const pBox = new THREE.Box3().setFromCenterAndSize(pos, new THREE.Vector3(0.7, 1.8, 0.7));
  for(let w of world.walls) if(pBox.intersectsBox(w.box)) return true;
  return false;
}

function shoot() {
  const w = WEAPONS[player.wIdx];
  const now = Date.now();
  if (player.ammo[player.wIdx] <= 0 || now - lastShot < w.rate) return;

  lastShot = now;
  player.ammo[player.wIdx]--;
  player.lastRegen = now;
  
  const ray = new THREE.Raycaster();
  const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
  dir.x += (Math.random()-0.5) * w.spread;
  dir.y += (Math.random()-0.5) * w.spread;
  ray.set(camera.position, dir);

  const hits = ray.intersectObjects(scene.children);
  if(hits.length > 0) {
    const hit = hits[0];
    for(let i=world.enemies.length-1; i>=0; i--) {
      if(hit.object === world.enemies[i].mesh) {
        // Blood Particles
        for(let k=0; k<6; k++) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({color: 0xff0000}));
          p.position.copy(hit.point);
          const vel = new THREE.Vector3((Math.random()-0.5)*0.2, Math.random()*0.2, (Math.random()-0.5)*0.2);
          world.particles.push({ mesh: p, vel, life: 1.0 });
          scene.add(p);
        }
        scene.remove(world.enemies[i].mesh);
        world.enemies.splice(i, 1);
        if(Math.random() > 0.8) spawnLoot(hit.point);
      }
    }
  }
  gunGroup.position.z += 0.1;
  updateUI();
  if(!w.auto) isShooting = false;
}

function spawnLoot(pos) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshPhongMaterial({color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 0.5}));
  m.position.set(pos.x, 0.4, pos.z);
  scene.add(m);
  world.loots.push(m);
}

function reload() {
  const w = WEAPONS[player.wIdx];
  let take = Math.min(w.mag - player.ammo[player.wIdx], player.res[player.wIdx]);
  player.ammo[player.wIdx] += take;
  player.res[player.wIdx] -= take;
  updateUI();
}

function switchWeapon(i) {
  player.wIdx = i;
  document.getElementById('weapon-label').innerText = WEAPONS[i].name;
  updateUI();
}

function updateUI() {
  document.getElementById('mag').innerText = player.ammo[player.wIdx];
  document.getElementById('res').innerText = player.res[player.wIdx];
  document.getElementById('hp-fill').style.width = player.hp + "%";
}

function drawRadar() {
  radarCtx.fillStyle = '#000';
  radarCtx.fillRect(0,0,150,150);
  radarCtx.strokeStyle = 'rgba(0, 255, 204, 0.2)';
  radarCtx.strokeRect(0,0,150,150);

  const scale = 2.5;
  const cx = 75, cz = 75;

  // Walls
  radarCtx.fillStyle = '#111';
  world.walls.forEach(w => {
    radarCtx.fillRect(cx + (w.x - w.w/2)*scale, cz + (w.z - w.d/2)*scale, w.w*scale, w.d*scale);
  });

  // Enemies
  radarCtx.fillStyle = '#ff0000';
  world.enemies.forEach(en => {
    radarCtx.fillRect(cx + en.mesh.position.x * scale - 2, cz + en.mesh.position.z * scale - 2, 4, 4);
  });

  // Player
  radarCtx.fillStyle = '#fff';
  radarCtx.beginPath();
  radarCtx.arc(cx + camera.position.x * scale, cz + camera.position.z * scale, 3, 0, Math.PI*2);
  radarCtx.fill();
}

function loop() {
  requestAnimationFrame(loop);
  if(!running) return;
  const dt = Math.min(clock.getDelta(), 0.1);

  // Move Logic
  const crouch = keys['KeyC'];
  const targetH = crouch ? 0.8 : 1.6;
  const speed = (crouch ? 3 : (keys['ShiftLeft'] ? 12 : 7)) * dt;
  
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  const move = new THREE.Vector3();
  if(keys['KeyW']) move.z -= 1; if(keys['KeyS']) move.z += 1;
  if(keys['KeyA']) move.x -= 1; if(keys['KeyD']) move.x += 1;
  move.applyAxisAngle(new THREE.Vector3(0,1,0), yaw).normalize().multiplyScalar(speed);

  if(!checkCol(camera.position.clone().add(new THREE.Vector3(move.x, 0, 0)))) camera.position.x += move.x;
  if(!checkCol(camera.position.clone().add(new THREE.Vector3(0, 0, move.z)))) camera.position.z += move.z;

  // Jump/Grav
  if(keys['Space'] && player.grounded) { player.velY = 8; player.grounded = false; }
  player.velY -= 22 * dt;
  camera.position.y += player.velY * dt;
  if(camera.position.y <= targetH) { camera.position.y = targetH; player.velY = 0; player.grounded = true; }

  // Shooting & ADS
  if(isShooting) shoot();
  gunGroup.position.lerp(isAds ? new THREE.Vector3(0, -0.12, -0.2) : new THREE.Vector3(0.3, -0.25, -0.4), 0.2);
  camera.fov = THREE.MathUtils.lerp(camera.fov, isAds ? 45 : 75, 0.2);
  camera.updateProjectionMatrix();

  // Health Regen
  if(Date.now() - player.lastRegen > 4000) {
    player.hp = Math.min(100, player.hp + 10 * dt);
    updateUI();
  }

  // AI
  if(world.enemies.length < 5) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.8), new THREE.MeshPhongMaterial({color: 0xff4400}));
    const a = Math.random()*Math.PI*2;
    m.position.set(Math.cos(a)*25, 0.8, Math.sin(a)*25);
    scene.add(m); world.enemies.push({mesh: m});
  }
  world.enemies.forEach(en => {
    const dir = new THREE.Vector3().subVectors(camera.position, en.mesh.position);
    dir.y = 0; const dist = dir.length(); dir.normalize();
    en.mesh.position.addScaledVector(dir, 5 * dt);
    en.mesh.lookAt(camera.position.x, 0.8, camera.position.z);
    if(dist < 1.3) { player.hp -= 25 * dt; updateUI(); if(player.hp <= 0) location.reload(); }
  });

  // Particles
  for(let i=world.particles.length-1; i>=0; i--) {
    const p = world.particles[i]; p.life -= dt;
    p.mesh.position.add(p.vel);
    if(p.life <= 0) { scene.remove(p.mesh); world.particles.splice(i,1); }
  }

  // Loot
  world.loots.forEach((l, i) => {
    if(l.position.distanceTo(camera.position) < 1.5) {
      player.res.forEach((r, idx) => player.res[idx] += 20);
      scene.remove(l); world.loots.splice(i, 1);
      updateUI();
    }
  });

  drawRadar();
  renderer.render(scene, camera);
}
