import { AdminFilterSelect } from "@/components/admin/design-system/AdminInputs";

interface HomepageSectionToolbarProps {
  scope: string;
  businessUnits: { id: string; name: string }[];
  onScopeChange: (scope: string) => void;
}

export function HomepageSectionToolbar({
  scope,
  businessUnits,
  onScopeChange,
}: HomepageSectionToolbarProps) {
  const options = [
    { value: "both", label: "Both Stores" },
    ...businessUnits.map((bu) => ({ value: bu.id, label: bu.name })),
  ];

  return (
    <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-sm font-semibold">Homepage Layout</h2>
        <p className="text-xs text-muted-foreground">
          Order, enable and schedule sections. Changes apply instantly to the
          storefront.
        </p>
      </div>
      <AdminFilterSelect
        value={scope}
        onValueChange={onScopeChange}
        options={options}
        placeholder="Store scope"
        label="Manage sections for"
      />
    </div>
  );
}
