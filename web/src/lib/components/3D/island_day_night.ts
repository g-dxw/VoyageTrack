import * as THREE from "three";

export interface IslandDayNight {
    setDarkMode(dark: boolean): void;
    dispose(): void;
}

function semantic(model: THREE.Object3D, role: string): THREE.Object3D {
    let result: THREE.Object3D | undefined;
    model.traverse((object) => { if (object.userData.web_role === role) result = object; });
    if (!result) throw new Error(`Missing day/night model anchor: ${role}`);
    return result;
}

function hikerBody(hiker: THREE.Object3D): THREE.Object3D {
    let body: THREE.Object3D | undefined;
    hiker.traverse((object) => { if (/_Body(?:[._]?\d+)?$/.test(object.name)) body = object; });
    if (!body) throw new Error(`Missing animated hiker body: ${hiker.name}`);
    return body;
}

/** Add after static batching; visibility and headlamp parents must stay independent. */
export function createIslandDayNight(model: THREE.Object3D, dark: boolean): IslandDayNight {
    // Validate every anchor before allocating resources or changing the model.
    const sun = semantic(model, "sun");
    const bodies = ["hiker_blue", "hiker_red"].map((role) => hikerBody(semantic(model, role)));
    const originalSunVisibility = sun.visible;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    const sunMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const lights: THREE.SpotLight[] = [];
    const additions: THREE.Object3D[] = [];
    let spriteGeometry: THREE.BufferGeometry | undefined;
    let disposed = false;

    function geometry<T extends THREE.BufferGeometry>(value: T): T { geometries.add(value); return value; }
    function material<T extends THREE.Material>(value: T): T { materials.add(value); return value; }
    function mesh(shape: THREE.BufferGeometry, surface: THREE.Material | THREE.Material[], parent: THREE.Object3D): THREE.Mesh {
        const object = new THREE.Mesh(shape, surface);
        // Celestial bodies and tiny lamp hardware do not add shadow-map work.
        parent.add(object);
        return object;
    }

    // A browser-independent radial texture also allows real-GLB lifecycle tests.
    const size = 64;
    function texture(alpha: (x: number, y: number) => number): THREE.DataTexture {
        const pixels = new Uint8Array(size * size * 4);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const offset = (y * size + x) * 4;
            pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255;
            pixels[offset + 3] = Math.round(255 * THREE.MathUtils.clamp(alpha((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1), 0, 1));
        }
        const result = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
        result.minFilter = result.magFilter = THREE.LinearFilter;
        result.needsUpdate = true;
        textures.add(result);
        return result;
    }
    const glowTexture = texture((x, y) => Math.pow(Math.max(0, 1 - Math.hypot(x, y)), 2.7));
    const sunGlowTexture = texture((x, y) => Math.pow(Math.max(0, 1 - Math.hypot(x, y)), 1.15));
    function halo(parent: THREE.Object3D, color: number, opacity: number, scale: number, name: string, map = glowTexture): THREE.Sprite {
        const sprite = new THREE.Sprite(material(new THREE.SpriteMaterial({
            map, color, opacity, transparent: true, depthWrite: false,
            depthTest: true, toneMapped: false,
        })));
        // Sprite defaults to Three's module-wide geometry. Own one shared clone
        // so renderer disposal listeners/buffers are released without touching
        // other scenes that use the global geometry.
        spriteGeometry ??= geometry(sprite.geometry.clone());
        sprite.geometry = spriteGeometry;
        sprite.name = name;
        sprite.scale.setScalar(scale);
        parent.add(sprite);
        return sprite;
    }

    // Clone only materials: borrowed model textures remain owned by the GLB.
    const solarCopies = new Map<THREE.Material, THREE.Material>();
    sun.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        sunMaterials.set(object, object.material);
        const illuminate = (original: THREE.Material): THREE.Material => {
            let copy = solarCopies.get(original);
            if (!copy) {
                copy = material(original.clone());
                if (copy instanceof THREE.MeshStandardMaterial) {
                    copy.emissive.copy(copy.color);
                    copy.emissiveIntensity = .42;
                    copy.toneMapped = true;
                }
                solarCopies.set(original, copy);
            }
            return copy;
        };
        object.material = Array.isArray(object.material) ? object.material.map(illuminate) : illuminate(object.material);
    });
    const sunHalo = halo(sun, 0xffbd48, .40, 3.1, "Island sun halo", sunGlowTexture);
    sunHalo.position.set(0, .08, 0);
    additions.push(sunHalo);

    // A sibling of the sun stays visible when the original sun root is hidden.
    const moon = new THREE.Group();
    moon.name = "Island moon";
    moon.position.copy(sun.position);
    moon.quaternion.copy(sun.quaternion);
    moon.scale.copy(sun.scale);
    (sun.parent ?? model).add(moon);
    additions.push(moon);
    const moonSurface = material(new THREE.MeshStandardMaterial({
        color: 0xfff2d0, roughness: .75, emissive: 0xffe9b5, emissiveIntensity: 1.7, toneMapped: false,
    }));
    const moonEdge = material(new THREE.MeshStandardMaterial({
        color: 0xf1ce8d, roughness: .8, emissive: 0xffcd73, emissiveIntensity: .55, toneMapped: false,
    }));
    const outerRadius = .60, innerRadius = .55, offset = .25;
    const intersectionX = (outerRadius ** 2 - innerRadius ** 2 + offset ** 2) / (2 * offset);
    const intersectionY = Math.sqrt(outerRadius ** 2 - intersectionX ** 2);
    const outerAngle = Math.atan2(intersectionY, intersectionX);
    const innerAngle = Math.atan2(intersectionY, intersectionX - offset);
    const crescent = new THREE.Shape();
    crescent.absarc(0, 0, outerRadius, outerAngle, Math.PI * 2 - outerAngle, false);
    crescent.absarc(offset, 0, innerRadius, -innerAngle, innerAngle, true);
    crescent.closePath();
    const moonShape = geometry(new THREE.ExtrudeGeometry(crescent, {
        depth: .10, steps: 1, curveSegments: 48,
        bevelEnabled: true, bevelThickness: .025, bevelSize: .022, bevelSegments: 3,
    }).translate(0, 0, -.05).rotateX(-Math.PI / 2));
    const moonBody = mesh(moonShape, [moonSurface, moonEdge], moon);
    moonBody.name = "Island crescent body";
    moonBody.position.y = .08;
    // Glow follows the crescent contour instead of filling a circular disc.
    // Its open centre is .30 units from the inner rim, so the aura fades there.
    const moonGlowTexture = texture((x, y) => {
        const px = x * 1.2, py = y * 1.2;
        const inside = Math.hypot(px, py) <= outerRadius && Math.hypot(px - offset, py) >= innerRadius;
        const tipDistance = Math.min(Math.hypot(px - intersectionX, py - intersectionY), Math.hypot(px - intersectionX, py + intersectionY));
        const arcDistance = (centerX: number, radius: number, start: number) => {
            const angle = THREE.MathUtils.euclideanModulo(Math.atan2(py, px - centerX), Math.PI * 2);
            return angle >= start && angle <= Math.PI * 2 - start
                ? Math.abs(Math.hypot(px - centerX, py) - radius) : tipDistance;
        };
        // Distance to the actual restricted arcs, not their complete circles:
        // the latter would leave an unwanted full-ring ghost on the open side.
        const distance = inside ? 0 : Math.min(arcDistance(0, outerRadius, outerAngle), arcDistance(offset, innerRadius, innerAngle));
        return Math.exp(-((distance / .15) ** 2));
    });
    const moonAura = mesh(geometry(new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2)), material(new THREE.MeshBasicMaterial({
        map: moonGlowTexture, color: 0xffdf9a, opacity: .80,
        transparent: true, depthWrite: false, toneMapped: false,
    })), moon);
    moonAura.name = "Island moon aura";
    moonAura.position.y = -.01;

    const housing = material(new THREE.MeshStandardMaterial({ color: 0x29343f, roughness: .65 }));
    const strap = material(new THREE.MeshStandardMaterial({ color: 0x36414a, roughness: 1 }));
    const lens = material(new THREE.MeshStandardMaterial({
        color: 0xffe4aa, roughness: .25, emissive: 0xffd58b, emissiveIntensity: 0,
    }));
    const lensGlows: THREE.Sprite[] = [];
    for (const [index, body] of bodies.entries()) {
        const lamp = new THREE.Group();
        lamp.name = `Island headlamp ${index + 1}`;
        body.add(lamp);
        additions.push(lamp);
        // Attach to the unscaled animated Body, not the scaled Head mesh.
        const band = mesh(geometry(new THREE.TorusGeometry(.109, .007, 4, 20)), strap, lamp);
        band.rotation.x = Math.PI / 2;
        band.position.y = .659;
        const casing = mesh(geometry(new THREE.BoxGeometry(.066, .046, .040)), housing, lamp);
        casing.position.set(0, .672, -.128);
        const glass = mesh(geometry(new THREE.CylinderGeometry(.022, .022, .008, 16)), lens, lamp);
        glass.name = "Headlamp lens";
        glass.rotation.x = Math.PI / 2;
        glass.position.set(0, .672, -.153);
        const glow = halo(lamp, 0xffdf9c, .65, .17, "Headlamp glow");
        glow.position.set(0, .672, -.160);
        lensGlows.push(glow);
        const target = new THREE.Object3D();
        target.position.set(0, -.08, -1.4);
        lamp.add(target);
        // Physical glTF forward is -Z (the Blender-axis extras are stale).
        const light = new THREE.SpotLight(0xffdfaa, 0, 2.8, .50, .8, 2);
        light.name = "Headlamp trail light";
        light.position.copy(glass.position);
        light.target = target;
        light.castShadow = false;
        lamp.add(light);
        lights.push(light);
    }

    function setDarkMode(next: boolean): void {
        if (disposed) return;
        sun.visible = sunHalo.visible = !next;
        moon.visible = next;
        lens.emissiveIntensity = next ? 3 : .03;
        lensGlows.forEach((glow) => { glow.visible = next; });
        lights.forEach((light) => { light.intensity = next ? 3.8 : 0; });
    }
    setDarkMode(dark);
    return {
        setDarkMode,
        dispose() {
            if (disposed) return;
            disposed = true;
            additions.forEach((object) => object.removeFromParent());
            sunMaterials.forEach((original, object) => { object.material = original; });
            sun.visible = originalSunVisibility;
            lights.forEach((light) => light.dispose());
            geometries.forEach((value) => value.dispose());
            materials.forEach((value) => value.dispose());
            textures.forEach((value) => value.dispose());
        },
    };
}
