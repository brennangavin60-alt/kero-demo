import { mergeSettings } from "@/lib/settings";
import { buildDefaultMatterChecklist } from "@/lib/matter-checklists";
import type {
  Client,
  FirmActivityLogEntry,
  KeroState,
  Matter,
  MatterChecklistItem,
  Settings,
  TeamMember,
  TimelineEvent
} from "@/lib/types";

const DEMO_SETTINGS: Settings = mergeSettings({
  firmName: "Kero Solicitors",
  firmAddress: "1 Merrion Square, Dublin 2",
  solicitorName: "Aoife Byrne"
});

const VERIFIED_AML = {
  photoIdReceived: true,
  proofOfAddressReceived: true,
  sourceOfFundsReceived: true,
  verified: true
};

const PENDING_AML = {
  photoIdReceived: true,
  proofOfAddressReceived: true,
  sourceOfFundsReceived: true,
  verified: false
};

const INCOMPLETE_AML = {
  photoIdReceived: true,
  proofOfAddressReceived: false,
  sourceOfFundsReceived: false,
  verified: false
};

function dateInputFromOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoFromOffset(days: number, hour = 10) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function demoChecklistForMatter(matter: Matter): MatterChecklistItem[] {
  const items = buildDefaultMatterChecklist(matter.type);
  const completeCount =
    matter.status === "Closed"
      ? items.length
      : Math.min(items.length, Math.max(0, matter.stageIndex + 1));
  return items.map((item, index) =>
    index < completeCount
      ? {
          ...item,
          completedAt: isoFromOffset(-Math.max(1, completeCount - index), 10)
        }
      : item
  );
}

export function createDemoState(settings: Settings = DEMO_SETTINGS): KeroState {
  settings = mergeSettings(settings);
  const now = new Date().toISOString();
  const teamMembers: TeamMember[] = [
    {
      id: "team_owner",
      name: settings.solicitorName || "Aoife Byrne",
      email: settings.firmEmail || "aoife@kero.local",
      role: "Owner",
      status: "Active",
      isOwner: true,
      createdAt: isoFromOffset(-120),
      updatedAt: now
    },
    {
      id: "team_demo_senior",
      name: "Paul Brennan",
      email: "paul@example.com",
      role: "Senior Solicitor",
      status: "Active",
      isOwner: false,
      createdAt: isoFromOffset(-95),
      updatedAt: isoFromOffset(-4)
    },
    {
      id: "team_demo_secretary",
      name: "Niamh Collins",
      email: "niamh@example.com",
      role: "Secretary",
      status: "Active",
      isOwner: false,
      createdAt: isoFromOffset(-75),
      updatedAt: isoFromOffset(-2)
    }
  ];
  const clients: Client[] = [
    {
      id: "client_demo_maeve",
      fullName: "Maeve O'Brien",
      address: "14 Sandymount Avenue, Dublin 4",
      phone: "087 555 0101",
      email: "maeve.obrien@example.com",
      ppsNumber: "1234567T",
      dateOfBirth: "1982-03-14"
    },
    {
      id: "client_demo_brian",
      fullName: "Brian Walsh",
      address: "22 Oakfield Road, Galway",
      phone: "086 555 0144",
      email: "brian.walsh@example.com",
      ppsNumber: "7654321A",
      dateOfBirth: "1976-09-02"
    },
    {
      id: "client_demo_ciara",
      fullName: "Ciara Murphy",
      address: "5 Harbour View, Dun Laoghaire, Co. Dublin",
      phone: "085 555 0198",
      email: "ciara.murphy@example.com",
      ppsNumber: "2345678B",
      dateOfBirth: "1990-11-20"
    },
    {
      id: "client_demo_patrick",
      fullName: "Patrick Byrne",
      address: "31 Elm Park, Cork",
      phone: "089 555 0120",
      email: "patrick.byrne@example.com",
      ppsNumber: "3456789C",
      dateOfBirth: "1968-06-05"
    },
    {
      id: "client_demo_nora",
      fullName: "Nora Singh",
      address: "8 Riverbank Walk, Limerick",
      phone: "083 555 0177",
      email: "nora.singh@example.com",
      ppsNumber: "4567890D",
      dateOfBirth: "1988-01-29"
    },
    {
      id: "client_demo_declan",
      fullName: "Declan O'Shea",
      address: "19 Ashgrove Close, Kilkenny",
      phone: "087 555 0119",
      email: "declan.oshea@example.com",
      ppsNumber: "5678901E",
      dateOfBirth: "1979-12-11"
    },
    {
      id: "client_demo_aisling",
      fullName: "Aisling Kelly",
      address: "42 Church Street, Sligo",
      phone: "086 555 0166",
      email: "aisling.kelly@example.com",
      ppsNumber: "6789012F",
      dateOfBirth: "1993-07-22"
    },
    {
      id: "client_demo_tom",
      fullName: "Tom Reilly",
      address: "3 Meadow Lane, Naas, Co. Kildare",
      phone: "085 555 0181",
      email: "tom.reilly@example.com",
      ppsNumber: "7890123G",
      dateOfBirth: "1985-04-18"
    }
  ];

  const matters: Matter[] = [
    {
      id: "matter_demo_001",
      fileReference: "KER-001",
      clientId: "client_demo_maeve",
      dateOpened: isoFromOffset(-42),
      updatedAt: isoFromOffset(-1, 15),
      status: "In Progress",
      stageIndex: 5,
      aml: VERIFIED_AML,
      notes: [
        {
          id: "note_demo_001",
          body: "Purchaser's solicitor chasing closing docs. Client confirmed keys are with auctioneer.",
          createdAt: isoFromOffset(-2, 11)
        }
      ],
      customTemplates: {},
      type: "conveyancing",
      fields: {
        propertyAddress: "14 Sandymount Avenue, Dublin 4",
        salePrice: "EUR 640,000",
        buyerName: "Liam Connolly",
        buyerSolicitorName: "Fitzgerald Legal",
        buyerSolicitorAddress: "6 Dawson Street, Dublin 2",
        auctioneerName: "Dublin Bay Estates",
        mortgageHolder: "AIB Mortgage Centre",
        closingDate: dateInputFromOffset(14)
      }
    },
    {
      id: "matter_demo_002",
      fileReference: "KER-002",
      clientId: "client_demo_brian",
      dateOpened: isoFromOffset(-28),
      updatedAt: isoFromOffset(-3, 12),
      status: "In Progress",
      stageIndex: 2,
      aml: PENDING_AML,
      notes: [
        {
          id: "note_demo_002",
          body: "Contract pack received. Search results requested from vendor's solicitor.",
          createdAt: isoFromOffset(-4, 9)
        }
      ],
      customTemplates: {},
      type: "purchase",
      fields: {
        propertyAddress: "9 Cedar Grove, Galway",
        purchasePrice: "EUR 385,000",
        vendorName: "Helen Moran",
        vendorSolicitorName: "West Coast Solicitors",
        vendorSolicitorAddress: "11 Eyre Square, Galway",
        mortgageLender: "Bank of Ireland",
        closingDate: dateInputFromOffset(35)
      }
    },
    {
      id: "matter_demo_003",
      fileReference: "KER-003",
      clientId: "client_demo_ciara",
      dateOpened: isoFromOffset(-63),
      updatedAt: isoFromOffset(-1, 9),
      status: "In Progress",
      stageIndex: 3,
      aml: VERIFIED_AML,
      notes: [
        {
          id: "note_demo_003",
          body: "Limitation is tight. Draft proceedings are with counsel for final review.",
          createdAt: isoFromOffset(-1, 9)
        }
      ],
      customTemplates: {},
      type: "litigation",
      fields: {
        disputeType: "Contract Dispute",
        disputeDescription: "Claim for unpaid renovation invoices",
        opponentName: "Northside Fitouts Ltd",
        opponentAddress: "Unit 4, Jamestown Business Park, Dublin 11",
        opponentSolicitor: "Byrne & Keane LLP",
        claimValue: "EUR 48,500",
        dateDisputeArose: dateInputFromOffset(-1780),
        limitationDate: dateInputFromOffset(45)
      }
    },
    {
      id: "matter_demo_004",
      fileReference: "KER-004",
      clientId: "client_demo_patrick",
      dateOpened: isoFromOffset(-18),
      updatedAt: isoFromOffset(-5, 14),
      status: "Open",
      stageIndex: 1,
      aml: INCOMPLETE_AML,
      notes: [],
      customTemplates: {},
      aiResearch: {
        status: "complete",
        summary:
          "Initial research flags standard demand-letter approach, evidence preservation, and a short chronology before sending correspondence."
      },
      type: "adhoc",
      fields: {
        matterDescription: "Advice on disputed building deposit refund",
        thirdPartyName: "Oakline Construction",
        thirdPartyAddress: "The Yard, Marina Road, Cork"
      }
    },
    {
      id: "matter_demo_005",
      fileReference: "KER-005",
      clientId: "client_demo_nora",
      dateOpened: isoFromOffset(-12),
      updatedAt: isoFromOffset(-2, 16),
      status: "Open",
      stageIndex: 0,
      aml: INCOMPLETE_AML,
      notes: [
        {
          id: "note_demo_005",
          body: "Awaiting certified ID and proof of address before title deeds request issues.",
          createdAt: isoFromOffset(-2, 16)
        }
      ],
      customTemplates: {},
      type: "conveyancing",
      fields: {
        propertyAddress: "8 Riverbank Walk, Limerick",
        salePrice: "EUR 295,000",
        buyerName: "Evan Doyle",
        buyerSolicitorName: "Treaty Law",
        buyerSolicitorAddress: "3 O'Connell Street, Limerick",
        auctioneerName: "Shannon Homes",
        mortgageHolder: "Permanent TSB",
        closingDate: dateInputFromOffset(50)
      }
    },
    {
      id: "matter_demo_006",
      fileReference: "KER-006",
      clientId: "client_demo_declan",
      dateOpened: isoFromOffset(-54),
      updatedAt: isoFromOffset(-4, 10),
      status: "In Progress",
      stageIndex: 4,
      aml: VERIFIED_AML,
      notes: [
        {
          id: "note_demo_006",
          body: "Loan pack reviewed. Requisitions on title substantially agreed.",
          createdAt: isoFromOffset(-4, 10)
        }
      ],
      customTemplates: {},
      type: "purchase",
      fields: {
        propertyAddress: "27 The Paddocks, Kilkenny",
        purchasePrice: "EUR 412,000",
        vendorName: "Sandra Nolan",
        vendorSolicitorName: "Marble City Legal",
        vendorSolicitorAddress: "2 Parliament Street, Kilkenny",
        mortgageLender: "Avant Money",
        closingDate: dateInputFromOffset(21)
      }
    },
    {
      id: "matter_demo_007",
      fileReference: "KER-007",
      clientId: "client_demo_aisling",
      dateOpened: isoFromOffset(-140),
      updatedAt: isoFromOffset(-30, 10),
      status: "Closed",
      stageIndex: 5,
      aml: VERIFIED_AML,
      notes: [
        {
          id: "note_demo_007",
          body: "Settlement agreement signed and file closed.",
          createdAt: isoFromOffset(-30, 10)
        }
      ],
      customTemplates: {},
      type: "litigation",
      fields: {
        disputeType: "Employment Dispute",
        disputeDescription: "Settlement of unpaid bonus dispute",
        opponentName: "Crestline Analytics Ltd",
        opponentAddress: "Innovation House, Sligo",
        opponentSolicitor: "Northwest Legal",
        claimValue: "EUR 16,000",
        dateDisputeArose: dateInputFromOffset(-620),
        limitationDate: dateInputFromOffset(460)
      }
    },
    {
      id: "matter_demo_008",
      fileReference: "KER-008",
      clientId: "client_demo_tom",
      dateOpened: isoFromOffset(-7),
      updatedAt: isoFromOffset(0, 9),
      status: "Open",
      stageIndex: 1,
      aml: PENDING_AML,
      notes: [
        {
          id: "note_demo_008",
          body: "Client wants a practical letter before considering formal proceedings.",
          createdAt: isoFromOffset(0, 9)
        }
      ],
      customTemplates: {},
      aiResearch: {
        status: "complete",
        summary:
          "Research summary suggests framing the initial correspondence around nuisance, evidence logs, and reasonable access proposals."
      },
      type: "adhoc",
      fields: {
        matterDescription: "Neighbour access and boundary correspondence",
        thirdPartyName: "Grace Whelan",
        thirdPartyAddress: "4 Meadow Lane, Naas, Co. Kildare"
      }
    },
    {
      id: "matter_demo_009",
      fileReference: "KER-009",
      clientId: "client_demo_maeve",
      dateOpened: isoFromOffset(-96),
      updatedAt: isoFromOffset(-12, 13),
      status: "Closed",
      stageIndex: 6,
      aml: VERIFIED_AML,
      notes: [
        {
          id: "note_demo_009",
          body: "Purchase completed. Registration follow-up diarised.",
          createdAt: isoFromOffset(-12, 13)
        }
      ],
      customTemplates: {},
      type: "purchase",
      fields: {
        propertyAddress: "Apartment 12, Dock Mill, Dublin 1",
        purchasePrice: "EUR 515,000",
        vendorName: "Dock Mill Holdings",
        vendorSolicitorName: "Capital Conveyancing",
        vendorSolicitorAddress: "18 Baggot Street Lower, Dublin 2",
        mortgageLender: "EBS",
        closingDate: dateInputFromOffset(-12)
      }
    },
    {
      id: "matter_demo_010",
      fileReference: "KER-010",
      clientId: "client_demo_brian",
      dateOpened: isoFromOffset(-35),
      updatedAt: isoFromOffset(-6, 15),
      status: "In Progress",
      stageIndex: 3,
      aml: PENDING_AML,
      notes: [
        {
          id: "note_demo_010",
          body: "Contracts returned signed. Awaiting purchaser signed counterpart.",
          createdAt: isoFromOffset(-6, 15)
        }
      ],
      customTemplates: {},
      type: "conveyancing",
      fields: {
        propertyAddress: "Old Mill Cottage, Oranmore, Co. Galway",
        salePrice: "EUR 470,000",
        buyerName: "Marta Jensen",
        buyerSolicitorName: "Connacht Legal Partners",
        buyerSolicitorAddress: "7 Shop Street, Galway",
        auctioneerName: "Atlantic Property",
        mortgageHolder: "Ulster Bank",
        closingDate: dateInputFromOffset(28)
      }
    }
  ];

  const timelineEvents: TimelineEvent[] = matters.flatMap((matter) => [
    {
      id: `timeline_demo_opened_${matter.id}`,
      matterId: matter.id,
      type: "matter_opened",
      description: `Matter opened (${matter.fileReference})`,
      actorName: settings.solicitorName || "Solicitor",
      createdAt: matter.dateOpened
    },
    ...(matter.stageIndex > 0
      ? [
          {
            id: `timeline_demo_stage_${matter.id}`,
            matterId: matter.id,
            type: "stage_advanced" as const,
            description: `Stage advanced to current stage`,
            actorName: settings.solicitorName || "Solicitor",
            createdAt: matter.updatedAt
          }
        ]
      : []),
    ...(matter.aml.verified
      ? [
          {
            id: `timeline_demo_aml_${matter.id}`,
            matterId: matter.id,
            type: "aml_verified" as const,
            description: "AML marked as verified",
            actorName: settings.solicitorName || "Solicitor",
            createdAt: matter.updatedAt
          }
        ]
      : []),
    ...matter.notes.map((note) => ({
      id: `timeline_demo_note_${note.id}`,
      matterId: matter.id,
      type: "note_added" as const,
      description: `Note added: ${note.body.slice(0, 120)}${note.body.length > 120 ? "..." : ""}`,
      actorName: settings.solicitorName || "Solicitor",
      createdAt: note.createdAt
    }))
  ]);
  const matterChecklists = Object.fromEntries(
    matters.map((matter) => [matter.id, demoChecklistForMatter(matter)])
  );
  const firmActivityLog: FirmActivityLogEntry[] = timelineEvents.map((event) => ({
    id: `activity_demo_${event.id}`,
    actorId: teamMembers.find((member) => member.name === event.actorName)?.id || "team_owner",
    actorName: event.actorName,
    actionType: event.type
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
    description: event.description,
    matterId: event.matterId,
    createdAt: event.createdAt,
    metadata: event.metadata
  }));

  return {
    settings,
    clients,
    matters: matters.map((matter, index) => ({
      ...matter,
      assignedTeamMemberId: teamMembers[index % teamMembers.length]?.id
    })),
    teamMembers,
    currentTeamMemberId: "team_owner",
    firmActivityLog,
    documentStatuses: {},
    documentSentAt: {},
    globalTemplates: {},
    customLetterTemplates: [],
    timeEntries: [],
    expenses: [],
    invoices: [],
    calendarEvents: [],
    matterChecklists,
    timelineEvents,
    recentMatterViews: [],
    pinnedMatterIds: [],
    conflictCheckLogs: []
  };
}
