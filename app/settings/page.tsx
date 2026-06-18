import { PermissionGate } from "@/components/access-restricted";
import { SettingsForm } from "@/components/settings-form";

export default function SettingsPage() {
  return (
    <PermissionGate permission="manageFirmSettings" label="Settings">
      <SettingsForm />
    </PermissionGate>
  );
}
