import { PermissionGate } from "@/components/access-restricted";
import { ActivityPage } from "@/components/activity-page";

export default function ActivityRoute() {
  return (
    <PermissionGate permission="viewActivity" label="Activity">
      <ActivityPage />
    </PermissionGate>
  );
}
