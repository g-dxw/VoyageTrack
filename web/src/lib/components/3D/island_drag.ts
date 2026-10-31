export interface IslandDragOptions {
    canDrag(): boolean;
    getYaw(): number;
    setYaw(yaw: number): void;
}
export interface IslandDrag {
    cancel(): void;
    dispose(): void;
}

/** Delegate from empty foreground hosts; the decorative canvas stays behind content. */
export function createIslandDrag(stage: HTMLDivElement, canvas: HTMLCanvasElement, options: IslandDragOptions): IslandDrag {
    const document = stage.ownerDocument;
    const view = document.defaultView;
    if (!view) throw new Error("The island drag surface requires a mounted document.");
    const HostElement = view.HTMLElement;
    const events = new view.AbortController();
    let disposed = false;
    let active: { id: number; x: number; yaw: number } | undefined;
    let cursorHost: HTMLElement | undefined;
    let cursorMode: "grab" | "grabbing" | undefined;
    const cursors: { element: HTMLElement; previous: string; priority: string; applied: string }[] = [];

    function clearCursor(): void {
        for (const { element, previous, priority, applied } of cursors) {
            // Do not overwrite a cursor another owner changed during this gesture.
            if (element.style.getPropertyValue("cursor") !== applied || element.style.getPropertyPriority("cursor") !== "") continue;
            if (previous) element.style.setProperty("cursor", previous, priority);
            else element.style.removeProperty("cursor");
        }
        cursors.length = 0;
        cursorHost = cursorMode = undefined;
    }
    function showCursor(host: HTMLElement, mode: "grab" | "grabbing"): void {
        if (cursorHost === host && cursorMode === mode) return;
        clearCursor();
        cursorHost = host;
        cursorMode = mode;
        for (const element of mode === "grabbing" && host !== document.body ? [host, document.body] : [host]) {
            cursors.push({ element, previous: element.style.getPropertyValue("cursor"), priority: element.style.getPropertyPriority("cursor"), applied: mode });
            element.style.setProperty("cursor", mode);
        }
    }
    function hostAt(target: EventTarget | null, x: number, y: number): HTMLElement | undefined {
        if (disposed || !options.canDrag() || !(target instanceof HostElement)) return;
        const bounds = stage.getBoundingClientRect();
        if (!bounds.width || !bounds.height || x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return;
        // Positive DIRECT-target whitelist. Using closest('.hero') would steal
        // search controls, links, text selection and cards nested in that hero.
        if (target === document.body || target === document.documentElement || target === stage || target === canvas || target.matches("section.hero")) return target;
    }
    function cancel(): void {
        const pointer = active;
        active = undefined;
        clearCursor();
        try {
            if (pointer && stage.hasPointerCapture(pointer.id)) stage.releasePointerCapture(pointer.id);
        } catch {
            // Native cancellation may already have invalidated the pointer ID.
        }
    }
    function hover(target: EventTarget | null, x: number, y: number): void {
        const host = hostAt(target, x, y);
        if (host) showCursor(host, "grab");
        else clearCursor();
    }
    document.addEventListener("pointerdown", (event) => {
        if (active || event.pointerType !== "mouse" || !event.isPrimary || event.button !== 0) return;
        const host = hostAt(event.target, event.clientX, event.clientY);
        if (!host) return;
        try { stage.setPointerCapture(event.pointerId); }
        catch { return; }
        active = { id: event.pointerId, x: event.clientX, yaw: options.getYaw() };
        options.setYaw(active.yaw);
        showCursor(host, "grabbing");
        event.preventDefault();
    }, { signal: events.signal });
    document.addEventListener("pointermove", (event) => {
        if (event.pointerType !== "mouse" || !event.isPrimary) return;
        if (active) {
            if (event.pointerId !== active.id) return;
            if (!options.canDrag() || !(event.buttons & 1)) { cancel(); return; }
            options.setYaw(active.yaw + (event.clientX - active.x) * .004);
            event.preventDefault();
        } else if (!event.buttons) hover(event.target, event.clientX, event.clientY);
        else clearCursor();
    }, { signal: events.signal });
    document.addEventListener("pointerup", (event) => {
        if (!active || event.pointerId !== active.id || event.button !== 0) return;
        if (options.canDrag()) options.setYaw(active.yaw + (event.clientX - active.x) * .004);
        cancel();
        hover(document.elementFromPoint(event.clientX, event.clientY), event.clientX, event.clientY);
    }, { signal: events.signal });
    document.addEventListener("pointercancel", (event) => {
        if (active?.id === event.pointerId) cancel();
    }, { signal: events.signal });
    stage.addEventListener("lostpointercapture", (event) => {
        if (active?.id === event.pointerId) cancel();
    }, { signal: events.signal });
    document.addEventListener("pointerout", (event) => {
        if (event.pointerType === "mouse" && !event.relatedTarget) cancel();
    }, { signal: events.signal });
    view.addEventListener("blur", cancel, { signal: events.signal });
    return {
        cancel,
        dispose() {
            if (disposed) return;
            disposed = true;
            events.abort();
            cancel();
        },
    };
}
