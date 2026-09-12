import { useRef, useState } from 'react';

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
export default function Tooltip({ label, children, className = '' }) {
  const [visible, setVisible] = useState(false);
  const hoverTimer = useRef(null);
  const touchTimer = useRef(null);
  const longPressed = useRef(false);

  function showAfterDelay() {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setVisible(true), HOVER_DELAY_MS);
  }
  function hideNow() {
    clearTimeout(hoverTimer.current);
    setVisible(false);
  }

  function handleTouchStart() {
    longPressed.current = false;
    touchTimer.current = setTimeout(() => {
      longPressed.current = true;
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
      <span className={`tooltip-bubble${visible ? ' tooltip-visible' : ''}`} role="tooltip">
        {label}
      </span>
    </span>
  );
}
