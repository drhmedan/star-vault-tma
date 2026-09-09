import { Obstacle, PlayerCharacter, Bullet, LootItem, SafeZone, Particle } from './types';
import { WEAPONS } from './weaponsData';

// Circle vs Axis-Aligned Bounding Box (AABB) Collision
export function checkCircleRect(
  cx: number, cy: number, cr: number,
  rx: number, ry: number, rw: number, rh: number
): boolean {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const distX = cx - closestX;
  const distY = cy - closestY;
  return (distX * distX + distY * distY) < (cr * cr);
}

// Push player out of colliding solid obstacles
export function resolveCollisions(
  player: PlayerCharacter,
  obstacles: Obstacle[]
) {
  obstacles.forEach(obs => {
    if (!obs.blocksBullets) return; // ignore bushes
    if (checkCircleRect(player.x, player.y, player.radius, obs.x, obs.y, obs.w, obs.h)) {
      const closestX = Math.max(obs.x, Math.min(player.x, obs.x + obs.w));
      const closestY = Math.max(obs.y, Math.min(player.y, obs.y + obs.h));
      const dx = player.x - closestX;
      const dy = player.y - closestY;
      const dist = Math.hypot(dx, dy);
      if (dist > 0) {
        const overlap = player.radius - dist;
        player.x += (dx / dist) * overlap;
        player.y += (dy / dist) * overlap;
      } else {
        // Center inside box fallback
        player.x += 2;
        player.y += 2;
      }
    }
  });
}

// Update Bullet physics and check ray hit against walls and players
export function updateBullets(
  bullets: Bullet[],
  obstacles: Obstacle[],
  players: PlayerCharacter[],
  onHit: (victimId: number, damage: number, bullet: Bullet) => void,
  createSparks: (x: number, y: number, color: string) => void
): Bullet[] {
  const activeBullets: Bullet[] = [];

  bullets.forEach(b => {
    const nextX = b.x + b.vx;
    const nextY = b.y + b.vy;
    const stepDist = Math.hypot(b.vx, b.vy);
    b.rangeRemaining -= stepDist;

    if (b.rangeRemaining <= 0) return; // despawn

    // 1. Check wall collision
    let hitWall = false;
    for (const obs of obstacles) {
      if (obs.blocksBullets && checkCircleRect(nextX, nextY, 4, obs.x, obs.y, obs.w, obs.h)) {
        hitWall = true;
        createSparks(nextX, nextY, '#f59e0b');
        break;
      }
    }
    if (hitWall) return; // bullet stops

    // 2. Check player collision
    let hitPlayer = false;
    for (const p of players) {
      if (p.id === b.ownerId || p.hp <= 0) continue;
      const dist = Math.hypot(nextX - p.x, nextY - p.y);
      if (dist < p.radius + 4) {
        hitPlayer = true;
        createSparks(nextX, nextY, '#ef4444');
        onHit(p.id, b.damage, b);
        break;
      }
    }
    if (hitPlayer) return;

    b.x = nextX;
    b.y = nextY;
    activeBullets.push(b);
  });

  return activeBullets;
}

// Safe zone update & damage
export function updateSafeZone(zone: SafeZone, deltaMs: number) {
  if (zone.isShrinking && zone.radius > zone.targetRadius) {
    zone.radius = Math.max(zone.targetRadius, zone.radius - zone.shrinkSpeed * (deltaMs / 1000));
  }
}

export function isOutsideZone(x: number, y: number, zone: SafeZone): boolean {
  const dist = Math.hypot(x - zone.x, y - zone.y);
  return dist > zone.radius;
}
