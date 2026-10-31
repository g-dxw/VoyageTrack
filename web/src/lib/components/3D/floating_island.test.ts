import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeStaticMeshes } from "./floating_island";

async function loadModel() {
    const bytes = readFileSync(new URL("../../../../static/models/floating-island.glb", import.meta.url));
    return new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, "");
}

function semantic(model: THREE.Object3D, role: string): THREE.Object3D {
    const node = model.getObjectsByProperty("type", "Object3D").find((object) => object.userData.web_role === role)
        ?? (() => {
            let result: THREE.Object3D | undefined;
            model.traverse((object) => { if (object.userData.web_role === role) result = object; });
            return result;
        })();
    if (!node) throw new Error(`Missing model role: ${role}`);
    return node;
}

function sample(model: THREE.Object3D, clip: THREE.AnimationClip, seconds: number): Map<string, number[]> {
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.setTime(seconds);
    model.updateMatrixWorld(true);
    const matrices = new Map<string, number[]>();
    model.traverse((object) => matrices.set(object.name, object.matrixWorld.toArray()));
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    return matrices;
}

describe("bundled homepage island", () => {
    it("keeps the confirmed landscape, four clouds and one complete hiking clip", async () => {
        const { scene, animations } = await loadModel();
        expect(animations).toHaveLength(1);
        expect(animations[0].name).toBe("IslandLoop");
        expect(animations[0].duration).toBeCloseTo(64, 5);
        for (const role of ["main_island", "hiker_blue", "hiker_red"]) expect(semantic(scene, role)).toBeDefined();
        const clouds: THREE.Object3D[] = [];
        scene.traverse((object) => { if (object.userData.web_role === "cloud") clouds.push(object); });
        expect(clouds).toHaveLength(4);
        const mountain = scene.getObjectByName("Snow-capped_central_mountain001");
        let peak: THREE.Object3D | undefined = mountain;
        scene.traverse((object) => { if (!peak && object.name.startsWith("Snow-capped")) peak = object; });
        if (!peak) throw new Error("Missing rear snow mountain");
        expect(new THREE.Box3().setFromObject(peak).max.y).toBeCloseTo(4.9296, 4);
    });

    it("moves both hikers, their limbs and clouds, then closes the actual end pose", async () => {
        const { scene, animations: [clip] } = await loadModel();
        const initial = sample(scene, clip, 0);
        const middle = sample(scene, clip, 5);
        for (const role of ["hiker_blue", "hiker_red", "cloud"]) {
            const node = semantic(scene, role);
            expect(middle.get(node.name)).not.toEqual(initial.get(node.name));
        }
        const hip = clip.tracks.find((track) => track.name.includes("Hip_L"));
        expect(hip, "The gait must be retained, not just sliding root motion").toBeDefined();
        if (!hip) throw new Error("Missing walking joint animation");
        const strideSize = hip.getValueSize();
        const startStride = Array.from(hip.values.slice(0, strideSize));
        expect(Array.from(hip.values).some((value, index) => Math.abs(value - startStride[index % strideSize]) > .05)).toBe(true);
        const end = sample(scene, clip, 64);
        for (const [name, values] of initial) {
            const final = end.get(name);
            expect(final, name).toBeDefined();
            if (!final) continue;
            expect(Math.max(...values.map((value, index) => Math.abs(value - final[index]))), name).toBeLessThan(.0001);
        }
    });

    it("top ribbons face upward consistently with their shading normals", async () => {
        const { scene } = await loadModel();
        scene.updateMatrixWorld(true);
        const checked = new Set<string>();
        const failures: string[] = [];
        scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            let ribbon: string | undefined;
            for (let current: THREE.Object3D | null = object; current; current = current.parent) {
                const label: unknown = current.userData.name;
                const name = typeof label === "string" ? label : current.name.replaceAll("_", " ");
                if (/^Trail\b|continuous\s+sand\s+banks|turquoise\s+current/.test(name)) ribbon = name.replace(/\.\d+$/, "");
            }
            if (!ribbon) return;
            checked.add(ribbon);
            const positions = object.geometry.getAttribute("position");
            const normals = object.geometry.getAttribute("normal");
            const indices = object.geometry.index;
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
            const count = indices?.count ?? positions.count;
            for (let triangle = 0; triangle < count; triangle += 3) {
                const ids = [0, 1, 2].map((offset) => indices ? indices.getX(triangle + offset) : triangle + offset);
                const points = ids.map((id) => new THREE.Vector3().fromBufferAttribute(positions, id).applyMatrix4(object.matrixWorld));
                const geometric = new THREE.Vector3().subVectors(points[1], points[0]).cross(new THREE.Vector3().subVectors(points[2], points[0]));
                if (geometric.lengthSq() < 1e-16) continue;
                geometric.normalize();
                const shading = ids.reduce((sum, id) => sum.add(new THREE.Vector3().fromBufferAttribute(normals, id)), new THREE.Vector3()).applyNormalMatrix(normalMatrix);
                if (geometric.y <= 0 || geometric.dot(shading) <= 0) failures.push(`${object.name}: triangle ${triangle / 3}`);
            }
        });
        const expected = [
            "Trail / arrival spur", "Trail / hiking circuit east mountain",
            "Trail / hiking circuit west meadow", "Trail / to mountain cabin",
            ...["Main river", "04 · Left spring island / outflow", "06 · Lower lake island / outflow"].flatMap((prefix) => [
                `${prefix} / continuous sand banks`,
                ...[0, 1, 2, 3].map((layer) => `${prefix} / turquoise current ${layer}`),
            ]),
        ];
        expect([...checked].sort(), "Check every ribbon root even if export splits it into primitives").toEqual(expected.sort());
        expect(failures, "Opposite-facing coplanar triangles flicker between front and back shading").toEqual([]);
    });

    it("static batching preserves animated world transforms throughout the loop", async () => {
        const { scene, animations: [clip] } = await loadModel();
        const animatedNames = new Set<string>();
        for (const track of clip.tracks) {
            const node: unknown = THREE.PropertyBinding.findNode(scene, THREE.PropertyBinding.parseTrackName(track.name).nodeName);
            if (node instanceof THREE.Object3D) animatedNames.add(node.name);
        }
        const times = [0, 8, 24, 48, 63.9];
        const before = times.map((time) => sample(scene, clip, time));
        let originalMeshes = 0;
        scene.traverse((object) => { if (object instanceof THREE.Mesh) originalMeshes++; });
        sample(scene, clip, 0);
        mergeStaticMeshes(scene, clip);
        let batchedMeshes = 0;
        scene.traverse((object) => { if (object instanceof THREE.Mesh) batchedMeshes++; });
        expect(batchedMeshes).toBeLessThan(originalMeshes * .75);
        for (const [index, time] of times.entries()) {
            const after = sample(scene, clip, time);
            for (const name of animatedNames) {
                const a = before[index].get(name), b = after.get(name);
                expect(a, name).toBeDefined(); expect(b, name).toBeDefined();
                if (!a || !b) continue;
                expect(Math.max(...a.map((value, i) => Math.abs(value - b[i]))), name).toBeLessThan(.0001);
            }
        }
    });
});
