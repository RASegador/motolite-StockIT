import { useEffect } from 'react';
import { X } from 'lucide-react';
import Tooltip from './Tooltip';

// Shared pop-up wrapper for every manual data-entry form in the app —
// centered overlay, scrollable card, a consistent X close button, and
// Escape-to-close. `dirty` gates only the "accidental" close paths
// (clicking the backdrop, pressing Escape) behind a confirm prompt — the
// explicit X button and a form's own Cancel button are a deliberate "I
// want to leave" action and close immediately, same as before.
export default function Modal({ title, onClose, dirty = false, children, className = '' }) {
  function closeIfConfirmed() {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  }

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') closeIfConfirmed();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  return (
    <div className="modal" onClick={closeIfConfirmed}>
      <div className={`modal-card ${className}`.trim()} onClick={(e) => e.stopPropagation()}>
        <div className="modal-card-header">
          {title && <h3 className="modal-card-title">{title}</h3>}
          <Tooltip label="Close" className="modal-card-close">
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </Tooltip>
        </div>
        <div className="modal-card-body">{children}</div>
      </div>
    </div>
  );
}
