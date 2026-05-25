import type { DepartmentOption, LocationOption, ReferenceValueOption } from "@/lib/reference-data";

type SelectProps = {
  disabled?: boolean;
  label: string;
  name: string;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
  required?: boolean;
  selectId: string;
};

function ManagedSelect({ disabled, label, name, options, placeholder = "Select one", required, selectId }: SelectProps) {
  return (
    <div className="field">
      <label htmlFor={selectId}>{label}</label>
      <select disabled={disabled} id={selectId} name={name} required={required}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DepartmentSelector({
  departments,
  disabled,
  label = "Department",
  name = "departmentId",
  required = false,
  selectId = "departmentId"
}: {
  departments: DepartmentOption[];
  disabled?: boolean;
  label?: string;
  name?: string;
  required?: boolean;
  selectId?: string;
}) {
  return (
    <ManagedSelect
      disabled={disabled}
      label={label}
      name={name}
      options={departments.map((department) => ({ label: department.name, value: department.id }))}
      placeholder="Select department"
      required={required}
      selectId={selectId}
    />
  );
}

export function LocationSelector({
  disabled,
  label = "Location",
  locations,
  name = "locationId",
  required = false,
  selectId = "locationId"
}: {
  disabled?: boolean;
  label?: string;
  locations: LocationOption[];
  name?: string;
  required?: boolean;
  selectId?: string;
}) {
  return (
    <ManagedSelect
      disabled={disabled}
      label={label}
      name={name}
      options={locations.map((location) => ({ label: location.name, value: location.id }))}
      placeholder="Select location"
      required={required}
      selectId={selectId}
    />
  );
}

export function ReferenceValueSelector({
  disabled,
  label,
  name,
  options,
  placeholder,
  required = false,
  selectId
}: {
  disabled?: boolean;
  label: string;
  name: string;
  options: ReferenceValueOption[];
  placeholder?: string;
  required?: boolean;
  selectId: string;
}) {
  return (
    <ManagedSelect
      disabled={disabled}
      label={label}
      name={name}
      options={options.map((option) => ({ label: option.label, value: option.slug }))}
      placeholder={placeholder}
      required={required}
      selectId={selectId}
    />
  );
}
