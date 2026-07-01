import { html } from "../../components/html.ts";
import { openModal } from "../../components/modal.ts";
import { toast } from "../../components/toast.ts";
import { updateStocktakeLine, type StocktakeLine } from "../../data/stocktakes.ts";

// Open the edit-line modal for one stocktake line. On a successful save the
// server returns the full updated line, which we hand to `onSaved` so the caller
// re-renders that row in place (no refetch). Per-line business errors (e.g. an
// adjustment that needs a reason) and thrown errors are shown inline; the modal
// stays open so edits aren't lost.
export function openLineEdit(
  line: StocktakeLine,
  onSaved: (updated: StocktakeLine) => void,
): void {
  const body = html`
    <p class="modal-context">${line.item.code} · ${line.itemName}<br />Snapshot: ${line.snapshotNumberOfPacks} packs</p>
    <label class="form-field">
      <span>Counted # packs</span>
      <input type="number" name="counted" class="field-input" min="0" step="1" value="${line.countedNumberOfPacks ?? ""}" />
    </label>
    <label class="form-field">
      <span>Batch</span>
      <input type="text" name="batch" class="field-input" value="${line.batch ?? ""}" />
    </label>
    <label class="form-field">
      <span>Comment</span>
      <textarea name="comment" class="field-input" rows="2">${line.comment ?? ""}</textarea>
    </label>
    <p class="form-error" role="alert" hidden></p>
  `;

  openModal({
    title: "Edit line",
    body,
    submitLabel: "Save",
    onSubmit: async (dialog) => {
      const counted = dialog.querySelector<HTMLInputElement>('input[name="counted"]')!;
      const batch = dialog.querySelector<HTMLInputElement>('input[name="batch"]')!;
      const comment = dialog.querySelector<HTMLTextAreaElement>('textarea[name="comment"]')!;
      const errEl = dialog.querySelector<HTMLElement>(".form-error")!;
      const fail = (msg: string) => {
        errEl.textContent = msg;
        errEl.hidden = false;
        return false;
      };

      const raw = counted.value.trim();
      const countedNumberOfPacks = raw === "" ? null : Number(raw);
      if (countedNumberOfPacks != null && !Number.isFinite(countedNumberOfPacks)) {
        return fail("Counted # packs must be a number.");
      }

      errEl.hidden = true;
      try {
        const { line: updated, error } = await updateStocktakeLine(line.id, {
          countedNumberOfPacks,
          batch: batch.value.trim() || null,
          comment: comment.value.trim() || null,
        });
        if (error || !updated) return fail(error ?? "Update failed.");
        onSaved(updated);
        toast("Line updated", "success");
        return true;
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });
}
