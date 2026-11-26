// file: Modal.js
// description: reusable modal shell with backdrop, ESC to close, and scroll lock.
// Also exports ConfirmModal and PromptModal built on top of it.

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";

export function Modal({ open, title, icon, onClose, children, width = 520 }) {
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        function onKey(e) { if (e.key === "Escape") onClose?.(); }
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", onKey);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="modal-backdrop pop-in"
             onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
            <div className="modal-panel" style={{ maxWidth: width }}>
                <div className="row-between mb">
                    <div className="row" style={{ gap: 10 }}>
                        {icon && <div className="feature-icon" style={{ marginBottom: 0, width: 36, height: 36 }}>{icon}</div>}
                        <h3>{title}</h3>
                    </div>
                    <button className="btn-ghost btn-icon" onClick={onClose} title="Close">
                        <X size={16} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

export function ConfirmModal({
    open, title, description, icon,
    confirmLabel = "Confirm",
    confirmClass = "btn-primary",
    cancelLabel  = "Cancel",
    loading      = false,
    onConfirm, onClose
}) {
    return (
        <Modal open={open} title={title} icon={icon} onClose={onClose}>
            {description && <p className="muted mb-lg">{description}</p>}
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                <button className="btn-ghost" onClick={onClose} disabled={loading}>{cancelLabel}</button>
                <button className={confirmClass} onClick={onConfirm} disabled={loading}>
                    {loading ? <span className="spinner" /> : null} {confirmLabel}
                </button>
            </div>
        </Modal>
    );
}

export function PromptModal({
    open, title, description, icon, placeholder,
    label = "Reason",
    confirmLabel = "Submit",
    confirmClass = "btn-primary",
    minLength    = 3,
    loading      = false,
    onConfirm, onClose
}) {
    const [value, setValue] = useState("");

    useEffect(() => { if (open) setValue(""); }, [open]);

    function submit(e) {
        e.preventDefault();
        if (value.trim().length < minLength) return;
        onConfirm?.(value.trim());
    }

    return (
        <Modal open={open} title={title} icon={icon} onClose={onClose}>
            {description && <p className="muted mb">{description}</p>}
            <form onSubmit={submit}>
                <div className="form-group">
                    <label className="form-label">{label}</label>
                    <textarea
                        autoFocus
                        placeholder={placeholder}
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        rows={4}
                    />
                    <span className="form-hint">{value.trim().length} characters, minimum {minLength}</span>
                </div>
                <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                    <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
                    <button type="submit" className={confirmClass} disabled={loading || value.trim().length < minLength}>
                        {loading ? <span className="spinner" /> : null} {confirmLabel}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export default Modal;
