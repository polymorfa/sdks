"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Icon, type IconName } from "./icons.js";

export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  readonly size?: "sm" | "md";
  readonly icon?: IconName;
  readonly loading?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("btn", `btn-${variant}`, `btn-${size}`, className)}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span className="spinner" aria-hidden="true" />
      ) : (
        icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />
      )}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  className,
  active = false,
  badge,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly icon: IconName;
  readonly label: string;
  readonly active?: boolean;
  readonly badge?: ReactNode;
}) {
  return (
    <button
      type={type}
      className={cx("icon-btn", active && "is-active", className)}
      aria-label={label}
      title={label}
      {...(active ? { "aria-pressed": true } : {})}
      {...props}
    >
      <Icon name={icon} />
      {badge !== undefined && <span className="icon-badge">{badge}</span>}
    </button>
  );
}

const AVATAR_COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#10b981",
  "#6366f1",
  "#14b8a6",
  "#e11d48",
];

export function initials(name: string): string {
  const letters = name
    .replace(/^\+/, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("");
  return (letters.length > 2 ? letters[0]! + letters.at(-1)! : letters)
    .toUpperCase()
    .slice(0, 2);
}

function colorFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

export function Avatar({
  name,
  src,
  size = 40,
  status,
  color,
}: {
  readonly name: string;
  readonly src?: string | undefined;
  readonly size?: number;
  readonly status?: "online" | "away" | "offline" | undefined;
  readonly color?: string | undefined;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: color ?? colorFor(name),
      }}
      aria-hidden="true"
    >
      {src !== undefined && !failed ? (
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        initials(name)
      )}
      {status !== undefined && (
        <span className={cx("avatar-status", `is-${status}`)} />
      )}
    </span>
  );
}

export function Badge({
  children,
  tone = "neutral",
  dot = false,
  className,
}: {
  readonly children: ReactNode;
  readonly tone?:
    "neutral" | "success" | "warning" | "danger" | "info" | "accent";
  readonly dot?: boolean;
  readonly className?: string;
}) {
  return (
    <span className={cx("badge", `badge-${tone}`, className)}>
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function TagChip({
  name,
  color,
  onRemove,
}: {
  readonly name: string;
  readonly color: string;
  readonly onRemove?: () => void;
}) {
  return (
    <span className="tag-chip" style={{ "--tag": color } as object}>
      <span className="tag-dot" aria-hidden="true" />
      {name}
      {onRemove && (
        <button
          type="button"
          className="tag-remove"
          aria-label={`Remove tag ${name}`}
          onClick={onRemove}
        >
          <Icon name="x" size={12} />
        </button>
      )}
    </span>
  );
}

export function Spinner({ label = "Loading" }: { readonly label?: string }) {
  return (
    <div className="center-state" role="status">
      <span className="spinner spinner-lg" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly children?: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  readonly error: string;
  readonly onRetry?: () => void;
}) {
  return (
    <div className="empty-state" role="alert">
      <span className="empty-icon is-danger">
        <Icon name="alert" size={28} />
      </span>
      <h3>Something went wrong</h3>
      <p>{error}</p>
      {onRetry && (
        <Button onClick={onRetry} icon="rotate">
          Try again
        </Button>
      )}
    </div>
  );
}

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
}: {
  readonly title: string;
  readonly description?: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    return () => opener?.focus?.();
  }, []);
  return (
    <dialog
      ref={ref}
      className={cx("modal", `modal-${size}`)}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="modal-card">
        <header className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </dialog>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | undefined;
  readonly children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        ...(hint || error ? { "aria-describedby": hintId } : {}),
        ...(error ? { "aria-invalid": true } : {}),
      })}
      {(error || hint) && (
        <p id={hintId} className={cx("field-hint", error && "is-error")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  readonly tabs: readonly {
    readonly id: T;
    readonly label: string;
    readonly count?: number;
  }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly label: string;
  readonly className?: string;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const move = (offset: number) => {
    const index = tabs.findIndex((tab) => tab.id === value);
    const next = tabs[(index + offset + tabs.length) % tabs.length];
    if (next) {
      onChange(next.id);
      refs.current.get(next.id)?.focus();
    }
  };
  return (
    <div
      className={cx("tabs", className)}
      role="tablist"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") move(1);
        if (event.key === "ArrowLeft") move(-1);
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          ref={(node) => {
            if (node) refs.current.set(tab.id, node);
          }}
          type="button"
          role="tab"
          aria-selected={tab.id === value}
          tabIndex={tab.id === value ? 0 : -1}
          className="tab"
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="tab-count">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  readonly options: readonly {
    readonly id: T;
    readonly label: string;
    readonly icon?: IconName;
  }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.icon && <Icon name={option.icon} size={16} />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly description?: string;
}) {
  const id = useId();
  return (
    <div className="switch-row">
      <div>
        <label htmlFor={id} className="switch-label">
          {label}
        </label>
        {description && <p className="muted small">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className="switch"
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  );
}

export function Menu({
  label,
  icon = "more",
  items,
  align = "end",
  trigger,
}: {
  readonly label: string;
  readonly icon?: IconName;
  readonly align?: "start" | "end";
  readonly trigger?: ReactNode;
  readonly items: readonly {
    readonly label: string;
    readonly icon?: IconName;
    readonly danger?: boolean;
    readonly disabled?: boolean;
    readonly onSelect: () => void;
  }[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    root.current
      ?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")
      ?.focus();
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) return;
    const buttons = [
      ...(root.current?.querySelectorAll<HTMLButtonElement>(
        "[role=menuitem]:not(:disabled)",
      ) ?? []),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    }
  };
  return (
    <div className="menu" ref={root} onKeyDown={onKeyDown}>
      {trigger === undefined ? (
        <IconButton
          icon={icon}
          label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
        />
      ) : (
        <button
          type="button"
          className="btn btn-secondary btn-md"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
        >
          {trigger}
        </button>
      )}
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={cx("menu-list", `menu-${align}`)}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={cx("menu-item", item.danger && "is-danger")}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon && <Icon name={item.icon} size={16} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
  icon,
  className,
  id,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly label: string;
  readonly icon?: IconName;
  readonly className?: string;
  readonly id?: string;
}) {
  return (
    <div className={cx("select", icon && "has-icon", className)}>
      {icon && <Icon name={icon} size={16} className="select-icon" />}
      <select
        id={id}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={16} className="select-chevron" />
    </div>
  );
}

export interface Column<T> {
  readonly key: string;
  readonly label: string;
  readonly render: (row: T) => ReactNode;
  readonly className?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  empty,
  caption,
}: {
  readonly rows: readonly T[];
  readonly columns: readonly Column<T>[];
  readonly rowKey: (row: T) => string;
  readonly onRowClick?: (row: T) => void;
  readonly empty?: ReactNode;
  readonly caption: string;
}) {
  if (rows.length === 0) {
    return <div className="table-empty">{empty ?? "Nothing here yet."}</div>;
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.className}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? "is-clickable" : undefined}
              {...(onRowClick
                ? {
                    tabIndex: 0,
                    onClick: () => onRowClick(row),
                    onKeyDown: (event: KeyboardEvent) => {
                      if (event.key === "Enter") onRowClick(row);
                    },
                  }
                : {})}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.className}
                  data-label={column.label}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RawJson({ value }: { readonly value: unknown }) {
  return (
    <details className="raw">
      <summary>
        <Icon name="code" size={14} /> View raw
      </summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
}: {
  readonly title?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={cx("card", className)}>
      {(title || actions) && (
        <header className="card-header">
          {title && <h2>{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

// Toasts ---------------------------------------------------------------------

type Toast = {
  readonly id: number;
  readonly message: string;
  readonly tone: "info" | "success" | "danger";
};
let toastId = 0;
const toastListeners = new Set<(toasts: readonly Toast[]) => void>();
let toasts: readonly Toast[] = [];

export function toast(message: string, tone: Toast["tone"] = "info"): void {
  const id = ++toastId;
  toasts = [...toasts, { id, message, tone }].slice(-4);
  toastListeners.forEach((listener) => listener(toasts));
  setTimeout(() => {
    toasts = toasts.filter((item) => item.id !== id);
    toastListeners.forEach((listener) => listener(toasts));
  }, 4000);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function Toaster() {
  const [items, setItems] = useState<readonly Toast[]>([]);
  useEffect(() => {
    toastListeners.add(setItems);
    return () => {
      toastListeners.delete(setItems);
    };
  }, []);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={cx("toast", `toast-${item.tone}`)}>
          <Icon
            name={
              item.tone === "success"
                ? "check"
                : item.tone === "danger"
                  ? "alert"
                  : "bell"
            }
            size={16}
          />
          {item.message}
        </div>
      ))}
    </div>
  );
}

/** Copies text and confirms with a toast. */
export function useCopy(): (text: string, what?: string) => void {
  return useCallback((text: string, what = "Copied") => {
    // Undefined outside secure contexts, such as plain HTTP on a LAN address.
    if (navigator.clipboard === undefined) {
      toast("Copy failed. Select the text instead.", "danger");
      return;
    }
    void navigator.clipboard
      .writeText(text)
      .then(() => toast(`${what} to clipboard`, "success"))
      .catch(() => toast("Copy failed. Select the text instead.", "danger"));
  }, []);
}
