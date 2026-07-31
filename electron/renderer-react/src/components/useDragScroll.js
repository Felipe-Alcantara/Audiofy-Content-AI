import { useEffect } from "react";

// Arrastar o texto com o mouse para rolar, como um scroll por toque em celular.
// Um clique normal num parágrafo (que pula o áudio) não deve virar arraste: só
// ativa scroll de fato depois de um deslocamento mínimo. Porte fiel de
// setupTeleprompterDragScroll() do renderer vanilla.
const DRAG_THRESHOLD_PX = 6;
// Quanto a velocidade encolhe a cada frame (~60fps), o piso abaixo do qual a
// inércia para, e um multiplicador aplicado à velocidade capturada no solto do
// mouse — o pedido era ser mais rápido que um scroll de roda normal.
const INERTIA_FRICTION = 0.985;
const INERTIA_MIN_VELOCITY = 0.5;
const INERTIA_BOOST = 3;

export default function useDragScroll(containerRef, enabled = true) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return undefined;

    let dragging = false;
    let didDrag = false;
    let startY = 0;
    let startScrollTop = 0;
    let lastMoveTime = 0;
    let lastMoveY = 0;
    let velocity = 0;
    let inertiaFrameId = null;

    const stopInertia = () => {
      if (inertiaFrameId !== null) {
        cancelAnimationFrame(inertiaFrameId);
        inertiaFrameId = null;
      }
    };

    const runInertia = () => {
      velocity *= INERTIA_FRICTION;
      if (Math.abs(velocity) < INERTIA_MIN_VELOCITY) {
        inertiaFrameId = null;
        return;
      }
      container.scrollTop -= velocity;
      inertiaFrameId = requestAnimationFrame(runInertia);
    };

    const onMouseDown = (event) => {
      stopInertia();
      dragging = true;
      didDrag = false;
      startY = event.clientY;
      startScrollTop = container.scrollTop;
      lastMoveTime = performance.now();
      lastMoveY = event.clientY;
      velocity = 0;
    };

    const onMouseMove = (event) => {
      if (!dragging) return;
      const delta = event.clientY - startY;
      if (!didDrag && Math.abs(delta) > DRAG_THRESHOLD_PX) {
        didDrag = true;
        container.classList.add("dragging");
      }
      if (didDrag) container.scrollTop = startScrollTop - delta;

      const now = performance.now();
      const elapsed = now - lastMoveTime;
      if (elapsed > 0) {
        velocity = (event.clientY - lastMoveY) / elapsed;
        lastMoveTime = now;
        lastMoveY = event.clientY;
      }
    };

    // Em captura, antes de qualquer onclick de parágrafo: se houve
    // deslocamento real, o clique do mouseup é suprimido para não pular o
    // áudio sem querer.
    const onCaptureClick = (event) => {
      if (!didDrag) return;
      event.stopPropagation();
      event.preventDefault();
    };

    const endDrag = () => {
      if (dragging && didDrag && Math.abs(velocity) >= INERTIA_MIN_VELOCITY) {
        velocity *= INERTIA_BOOST;
        inertiaFrameId = requestAnimationFrame(runInertia);
      }
      dragging = false;
      container.classList.remove("dragging");
    };

    container.addEventListener("mousedown", onMouseDown);
    container.addEventListener("mousemove", onMouseMove);
    container.addEventListener("click", onCaptureClick, true);
    container.addEventListener("mouseup", endDrag);
    container.addEventListener("mouseleave", endDrag);
    // Girar a roda durante a inércia faria os dois scrolls competirem.
    container.addEventListener("wheel", stopInertia, { passive: true });

    return () => {
      stopInertia();
      container.removeEventListener("mousedown", onMouseDown);
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("click", onCaptureClick, true);
      container.removeEventListener("mouseup", endDrag);
      container.removeEventListener("mouseleave", endDrag);
      container.removeEventListener("wheel", stopInertia);
    };
  }, [containerRef, enabled]);
}
