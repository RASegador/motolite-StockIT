import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const HOVER_DELAY_MS = 400;
const LONG_PRESS_MS = 500;

// Wraps a single icon-only control (button, etc.) with a floating
// description bubble. Desktop/mouse: appears after a short hover delay (or
// immediately on keyboard focus, for accessibility) and disappears on
// mouseleave/blur. Touch: hover doesn't exist, so a normal quick tap still
// performs the button's own action exactly as before — but a long-press
// (500ms) shows the tooltip instead and suppresses the synthetic click
// mobile browsers fire after touchend, so checking what a destructive
// action (e.g. Delete) does doesn't accidentally trigger it.
//
// The bubble is rendered through a portal into document.body, positioned
// with `position: fixed` from the trigger's live getBoundingClientRect().
// Every icon-button group that needed this (Inventory's table wrapper,
// POS's scrollable cart-lines list) sets `overflow-x: auto` without an
// explicit overflow-y — and per the CSS overflow spec, pairing a
// non-visible x with an unset y silently computes the y axis to `auto`
// too, clipping anything positioned outside the container's box. A plain
// `position: absolute` bubble nested inside one of those was rendering,
// just invisibly clipped. Portaling to <body> escapes that entirely.
export default function Tooltip({ label, children, className = '' }) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState(null);
  const wrapRef = useRef(null);
  const hoverTimer = useRef(null);
  const touchTimer = useRef(null);
  const longPressed = useRef(false);

  function computeCoords() {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ top: rect.top, left: rect.left + rect.width / 2 });
  }

  function showAfterDelay() {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => { computeCoords(); setVisible(true); }, HOVER_DELAY_MS);
  }
  function hideNow() {
    clearTimeout(hoverTimer.current);
    setVisible(false);
  }

  function handleTouchStart() {
    longPressed.current = false;
    touchTimer.current = setTimeout(() => {
      longPressed.current = true;
      computeCoords();
      setVisible(true);
    }, LONG_PRESS_MS);
  }
  function handleTouchEnd(e) {
    clearTimeout(touchTimer.current);
    if (longPressed.current) {
      e.preventDefault(); // suppress the click a long-press would otherwise still fire
      setTimeout(() => setVisible(false), 1500);
    }
  }
  function handleTouchCancel() {
    clearTimeout(touchTimer.current);
  }

  return (
    <span
      ref={wrapRef}
      className={`tooltip-wrap ${className}`.trim()}
      onMouseEnter={showAfterDelay}
      onMouseLeave={hideNow}
      onFocus={showAfterDelay}
      onBlur={hideNow}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {children}
      {visible && coords && createPortal(
        <span
          className="tooltip-bubble tooltip-visible"
          role="tooltip"
          style={{ top: coords.top, left: coords.left }}
        >
          {label}
        </span>,
        document.body
      )}
    </span>
  );
}
