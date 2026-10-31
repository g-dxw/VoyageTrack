// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIslandDrag } from "./island_drag";

const cleanups: (() => void)[] = [];
afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    document.body.replaceChildren();
    document.body.style.removeProperty("cursor");
    vi.restoreAllMocks();
});

function fixture() {
    const hero = document.createElement("section");
    hero.className = "hero";
    const copy = document.createElement("div");
    const text = document.createElement("p");
    text.textContent = "Selectable homepage copy";
    const input = document.createElement("input");
    const link = document.createElement("a");
    link.href = "/search";
    const button = document.createElement("button");
    copy.append(text, input, link, button);
    hero.append(copy);
    const footer = document.createElement("footer");
    const stage = document.createElement("div");
    const canvas = document.createElement("canvas");
    stage.append(canvas);
    stage.style.pointerEvents = "none";
    document.body.append(hero, footer, stage);
    stage.getBoundingClientRect = () => new DOMRect(400, 80, 600, 700);
    const captured = new Set<number>();
    stage.setPointerCapture = vi.fn((id: number) => { captured.add(id); });
    stage.hasPointerCapture = (id) => captured.has(id);
    stage.releasePointerCapture = vi.fn((id: number) => { captured.delete(id); });
    document.elementFromPoint = () => hero;
    let enabled = true;
    const visualYaw = .17;
    let targetYaw = -.2;
    const setYaw = vi.fn((next: number) => { targetYaw = next; });
    const drag = createIslandDrag(stage, canvas, {
        canDrag: () => enabled,
        getYaw: () => visualYaw,
        setYaw,
    });
    cleanups.push(drag.dispose);
    function pointer(target: EventTarget, type: string, init: PointerEventInit = {}) {
        const event = new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerType: "mouse", isPrimary: true,
            pointerId: 1, button: 0, clientX: 600, clientY: 300, ...init,
        });
        target.dispatchEvent(event);
        return event;
    }
    return {
        hero, copy, text, input, link, button, footer, stage, canvas, drag, captured,
        pointer, setYaw, visualYaw, getTarget: () => targetYaw,
        disable: () => { enabled = false; },
    };
}

describe("island drag delegation", () => {
    it("drags the empty hero while the canvas stays behind it, starting from the visible yaw", () => {
        const f = fixture();
        f.pointer(f.hero, "pointermove");
        expect(f.hero.style.cursor).toBe("grab");
        expect(f.stage.style.pointerEvents).toBe("none");
        const down = f.pointer(f.hero, "pointerdown", { buttons: 1 });
        expect(down.defaultPrevented).toBe(true);
        expect(f.captured.has(1)).toBe(true);
        expect(f.getTarget()).toBe(f.visualYaw);
        expect(f.hero.style.cursor).toBe("grabbing");
        expect(document.body.style.cursor).toBe("grabbing");
        f.pointer(document.body, "pointermove", { clientX: 700, clientY: 600, buttons: 1 });
        expect(f.getTarget()).toBeGreaterThan(f.visualYaw);
        const horizontal = f.getTarget();
        f.pointer(document.body, "pointermove", { clientX: 700, clientY: 100, buttons: 1 });
        expect(f.getTarget(), "Vertical movement must not tilt the island").toBe(horizontal);
        f.pointer(f.stage, "pointerup", { clientX: 700 });
        expect(f.captured.size).toBe(0);
        expect(document.body.style.cursor).toBe("");
        expect(f.hero.style.cursor).toBe("grab");
        f.pointer(f.input, "pointermove");
        expect(f.hero.style.cursor).toBe("");
    });

    it.each(["stage", "canvas"] as const)("drags the contained scene through its direct %s surface", (surface) => {
        const f = fixture();
        f.hero.append(f.stage);
        f.stage.style.pointerEvents = "auto";
        document.elementFromPoint = () => f[surface];
        const down = f.pointer(f[surface], "pointerdown", { buttons: 1 });
        expect(down.defaultPrevented).toBe(true);
        expect(f.captured.has(1)).toBe(true);
        expect(f.getTarget()).toBe(f.visualYaw);
        f.pointer(f.stage, "pointermove", { clientX: 680, buttons: 1 });
        expect(f.getTarget()).toBeCloseTo(f.visualYaw + 80 * .004);
        f.pointer(f.stage, "pointerup", { clientX: 680 });
        expect(f.captured.size).toBe(0);
        expect(f[surface].style.cursor).toBe("grab");
        expect(document.body.style.cursor).toBe("");
        expect(f.pointer(f.input, "pointerdown", { buttons: 1 }).defaultPrevented).toBe(false);
    });

    it("preserves foreground selection/controls, non-left input, touch, scrolling and unavailable scenes", () => {
        const f = fixture();
        for (const target of [f.copy, f.text, f.input, f.link, f.button, f.footer]) {
            expect(f.pointer(target, "pointerdown", { buttons: 1 }).defaultPrevented).toBe(false);
        }
        for (const init of [
            { button: 1, buttons: 4 }, { button: 2, buttons: 2 },
            { pointerType: "touch", buttons: 1 }, { pointerType: "pen", buttons: 1 },
            { isPrimary: false, buttons: 1 }, { clientX: 100, buttons: 1 },
        ]) expect(f.pointer(f.hero, "pointerdown", init).defaultPrevented).toBe(false);
        const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 });
        f.hero.dispatchEvent(wheel);
        expect(wheel.defaultPrevented).toBe(false);
        f.disable();
        expect(f.pointer(f.hero, "pointerdown", { buttons: 1 }).defaultPrevented).toBe(false);
        expect(f.stage.setPointerCapture).not.toHaveBeenCalled();
        expect(f.setYaw).not.toHaveBeenCalled();
    });

    it.each(["cancel", "lost capture", "blur", "context loss", "dispose"])("releases capture and restores owned cursor styles after %s", (reason) => {
        const f = fixture();
        f.hero.style.cursor = "zoom-in";
        document.body.style.setProperty("cursor", "crosshair", "important");
        f.pointer(f.hero, "pointerdown", { buttons: 1 });
        if (reason === "cancel") f.pointer(f.stage, "pointercancel");
        if (reason === "lost capture") f.pointer(f.stage, "lostpointercapture");
        if (reason === "blur") window.dispatchEvent(new Event("blur"));
        if (reason === "context loss") { f.disable(); f.drag.cancel(); }
        if (reason === "dispose") f.drag.dispose();
        expect(f.captured.size).toBe(0);
        expect(f.hero.style.cursor).toBe("zoom-in");
        expect(document.body.style.cursor).toBe("crosshair");
        expect(document.body.style.getPropertyPriority("cursor")).toBe("important");
        const calls = f.setYaw.mock.calls.length;
        f.pointer(f.stage, "pointermove", { clientX: 720, buttons: 1 });
        expect(f.setYaw.mock.calls).toHaveLength(calls);
        f.drag.dispose();
        f.pointer(f.hero, "pointerdown", { buttons: 1 });
        expect(f.captured.size).toBe(0);
    });

    it("does not overwrite cursor changes made by another owner during a drag", () => {
        const f = fixture();
        f.pointer(f.hero, "pointerdown", { buttons: 1 });
        document.body.style.cursor = "wait";
        f.hero.style.cursor = "help";
        f.drag.dispose();
        expect(document.body.style.cursor).toBe("wait");
        expect(f.hero.style.cursor).toBe("help");
        expect(f.captured.size).toBe(0);
    });
});
