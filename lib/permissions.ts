import type { TeamMember, TeamRole } from "@/lib/types";

export const TEAM_ROLES: TeamRole[] = [
  "Senior Solicitor",
  "Solicitor",
  "Trainee Solicitor",
  "Secretary",
  "Paralegal",
  "Administrator"
];

export type PermissionKey =
  | "viewDashboard"
  | "viewKeroAi"
  | "useKeroAiActions"
  | "createMatter"
  | "openCloseMatters"
  | "viewMatters"
  | "editMatters"
  | "viewClients"
  | "editClients"
  | "viewDocuments"
  | "generateLetters"
  | "manageAml"
  | "viewCalendar"
  | "viewActivity"
  | "viewBilling"
  | "generateInvoices"
  | "logTime"
  | "viewResources"
  | "viewFirmHub"
  | "manageFirmSettings"
  | "manageTeam";

type PermissionSet = Record<PermissionKey, boolean>;

const allPermissions: PermissionSet = {
  viewDashboard: true,
  viewKeroAi: true,
  useKeroAiActions: true,
  createMatter: true,
  openCloseMatters: true,
  viewMatters: true,
  editMatters: true,
  viewClients: true,
  editClients: true,
  viewDocuments: true,
  generateLetters: true,
  manageAml: true,
  viewCalendar: true,
  viewActivity: true,
  viewBilling: true,
  generateInvoices: true,
  logTime: true,
  viewResources: true,
  viewFirmHub: true,
  manageFirmSettings: true,
  manageTeam: true
};

const matterOnlyPermissions: PermissionSet = {
  ...allPermissions,
  viewBilling: false,
  generateInvoices: false,
  manageFirmSettings: false,
  manageTeam: false
};

export const ROLE_PERMISSIONS: Record<TeamRole, PermissionSet> = {
  Owner: allPermissions,
  "Senior Solicitor": allPermissions,
  Solicitor: matterOnlyPermissions,
  "Trainee Solicitor": {
    ...matterOnlyPermissions,
    createMatter: false,
    openCloseMatters: false,
    viewBilling: false,
    generateInvoices: false
  },
  Secretary: {
    ...matterOnlyPermissions,
    editClients: true,
    logTime: false,
    openCloseMatters: true
  },
  Paralegal: {
    ...matterOnlyPermissions,
    logTime: true,
    openCloseMatters: true
  },
  Administrator: {
    ...allPermissions,
    createMatter: false,
    openCloseMatters: false
  }
};

export function getPermissions(member?: TeamMember): PermissionSet {
  if (!member || member.isOwner || member.role === "Owner") return ROLE_PERMISSIONS.Owner;
  return ROLE_PERMISSIONS[member.role] ?? ROLE_PERMISSIONS.Solicitor;
}

export function hasPermission(member: TeamMember | undefined, permission: PermissionKey) {
  return getPermissions(member)[permission];
}

export function permissionSummary(role: TeamRole) {
  if (role === "Owner" || role === "Senior Solicitor") {
    return "Full access to matters, clients, billing, settings, team management and firm reporting.";
  }
  if (role === "Solicitor") {
    return "Full access to matters and clients, without firm settings or team management.";
  }
  if (role === "Trainee Solicitor") {
    return "Can view and edit matters, without billing, invoices or opening and closing files.";
  }
  if (role === "Secretary") {
    return "Can create matters, generate letters and manage AML, without billing or firm settings.";
  }
  if (role === "Paralegal") {
    return "Secretary access plus time logging.";
  }
  return "Full operational access except opening or closing matters.";
}
