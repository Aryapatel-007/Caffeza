import Input from '../../components/ui/Input.jsx';

/**
 * The editor for variants and for add-ons. Same shape, so one component.
 *
 * THE IMPORTANT PART: an existing entry carries its `id` and that id must go
 * back to the server untouched. M4 attaches recipes to a variantId and M2
 * stores one on an open order line, so regenerating ids on an edit silently
 * detaches a recipe the first time someone renames "Half" to "Half Plate", and
 * nothing notices until a stock deduction runs weeks later.
 *
 * A new entry has no id and the server mints one. Removing an entry from this
 * list removes the subdocument. See API-CONTRACT.md section 5.4.
 */
export default function SubItemListEditor({ title, entries, onChange, addLabel, fieldErrors }) {
  function patch(index, changes) {
    onChange(entries.map((entry, i) => (i === index ? { ...entry, ...changes } : entry)));
  }

  function remove(index) {
    onChange(entries.filter((_, i) => i !== index));
  }

  function add() {
    // No id. The server assigns one and it is permanent from then on.
    onChange([...entries, { name: '', price: '', isAvailable: true }]);
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium tracking-[0.06em] text-steel">{title.toUpperCase()}</h3>

      {entries.map((entry, index) => (
        <div
          key={entry.id ?? `new-${index}`}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-steel/50 p-2.5"
        >
          <Input
            className="min-w-0 flex-1"
            label="Name"
            value={entry.name}
            onChange={(event) => patch(index, { name: event.target.value })}
            error={fieldErrors?.[`${title.toLowerCase()}.${index}.name`]}
          />
          <Input
            className="w-28"
            label="Price"
            inputMode="decimal"
            value={entry.price}
            onChange={(event) => patch(index, { price: event.target.value })}
            error={fieldErrors?.[`${title.toLowerCase()}.${index}.price`]}
          />
          <button
            type="button"
            onClick={() => remove(index)}
            className="min-h-[44px] px-2 text-[13px] font-medium text-mirch underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirch"
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="self-start py-1 text-[13px] font-medium text-steel underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
      >
        {addLabel}
      </button>
    </section>
  );
}
