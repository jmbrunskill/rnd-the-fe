import { esc, type Html } from "./html.ts";

// Minimal, dependency-free modal built on the native <dialog> element:
// showModal() gives a focus trap, Esc-to-close, ::backdrop, and aria-modal for
// free. `body` is trusted markup (build it with html``). Save runs `onSubmit`,
// which returns whether to close (so it can keep the modal open on error).

export interface ModalOptions {
  title: string;
  body: Html;
  submitLabel?: string;
  onSubmit: (dialog: HTMLDialogElement) => boolean | Promise<boolean>;
}

export interface ModalHandle {
  dialog: HTMLDialogElement;
  close: () => void;
}

export function openModal(opts: ModalOptions): ModalHandle {
  const dialog = document.createElement("dialog");
  dialog.className = "modal";
  dialog.innerHTML =
    `<form class="modal-form" method="dialog">` +
    `<h2 class="modal-title">${esc(opts.title)}</h2>` +
    `<div class="modal-body">${opts.body}</div>` +
    `<div class="modal-actions">` +
    `<button type="button" class="modal-cancel">Cancel</button>` +
    `<button type="submit" class="modal-save">${esc(opts.submitLabel ?? "Save")}</button>` +
    `</div>` +
    `</form>`;

  const close = () => {
    if (dialog.open) dialog.close();
    dialog.remove();
  };

  dialog.querySelector<HTMLButtonElement>(".modal-cancel")?.addEventListener("click", close);
  // Backdrop click (the target is the <dialog> itself, not its content).
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
  // Esc fires "cancel"; ensure the node is removed too.
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });

  const form = dialog.querySelector<HTMLFormElement>(".modal-form")!;
  const saveBtn = dialog.querySelector<HTMLButtonElement>(".modal-save")!;
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); // we decide when to close, not the native method="dialog"
    saveBtn.disabled = true;
    try {
      if (await opts.onSubmit(dialog)) close();
    } finally {
      saveBtn.disabled = false;
    }
  });

  document.body.appendChild(dialog);
  dialog.showModal();
  dialog.querySelector<HTMLElement>("input, textarea, select")?.focus();

  return { dialog, close };
}
