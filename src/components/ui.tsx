import { useEffect, useRef, type ReactNode } from 'react';
import { X, Zap, ArrowLeft, CircleHelp } from 'lucide-react';
export function Brand() {
  return (
    <a href="/" className="brand" aria-label="QuiBuzz home">
      <span className="brand-mark">
        <Zap size={23} fill="currentColor" />
      </span>
      <span>
        Qui<span className="brand-accent">Buzz</span>
        <small>LIVE QUIZ CONTROL</small>
      </span>
    </a>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Confirm({
  title,
  description,
  label = 'Confirm',
  danger = false,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  label?: string;
  danger?: boolean;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="muted modal-description">{description}</p>
      <div className="modal-actions">
        <button className="btn" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className={`btn ${danger ? 'danger-solid' : 'primary'}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? 'Saving…' : label}
        </button>
      </div>
    </Modal>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <span className="spinner" />
      <h2>Opening your control room</h2>
      <p className="muted">Loading saved quiz data…</p>
    </div>
  );
}
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">YOUR QUIZ. YOUR STAGE.</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
export function BackHome() {
  return (
    <a className="back-link" href="/">
      <ArrowLeft size={16} /> All quizzes
    </a>
  );
}
export function Help() {
  return (
    <div className="help-note">
      <CircleHelp size={17} />
      <span>
        Scores stay on this question until you choose Next. Every scoring action can be undone.
      </span>
    </div>
  );
}
