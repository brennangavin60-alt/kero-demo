export type ResourceLink = {
  title: string;
  url: string;
  description: string;
  aliases?: string[];
};

export type ResourceCategory = {
  title: string;
  links: ResourceLink[];
};

export const resourceCategories: ResourceCategory[] = [
  {
    title: "Land Registry",
    links: [
      {
        title: "LandDirect",
        url: "https://www.landdirect.ie/",
        description: "Official Land Registry search, order folios, check title and use registry services.",
        aliases: ["land direct", "land registry", "folio search", "title search", "pra"]
      },
      {
        title: "Land Registry Online",
        url: "https://www.landregistryonline.ie/",
        description: "Commercial folio and title map retrieval service for quick title document orders.",
        aliases: ["folio", "title map", "property title", "land registry online"]
      }
    ]
  },
  {
    title: "Searches",
    links: [
      {
        title: "Irish Land Commission Records",
        url: "https://www.nli.ie/news-stories/stories/tracing-irelands-land-history-digitisation-keane-index",
        description: "Background and access context for historic Land Commission records and non-registered property research.",
        aliases: ["land commission", "keane index", "unregistered property", "historic land records"]
      },
      {
        title: "Registry of Deeds",
        url: "https://tailte.ie/services/property-registration/",
        description: "Registry of Deeds information for unregistered title and deed registration searches.",
        aliases: ["deeds", "unregistered title", "tailte", "property registration"]
      }
    ]
  },
  {
    title: "Court",
    links: [
      {
        title: "Courts Service",
        url: "https://www.courts.ie/",
        description: "Court dates, case information, court offices, forms, rules and documents.",
        aliases: ["courts", "court dates", "court forms", "case information", "rules of court"]
      }
    ]
  },
  {
    title: "Legal Research",
    links: [
      {
        title: "Irish Statute Book",
        url: "https://www.irishstatutebook.ie/",
        description: "Irish legislation, statutory instruments and official consolidated texts.",
        aliases: ["legislation", "acts", "statutory instruments", "irish law", "statute book"]
      },
      {
        title: "Court of Justice of the European Union",
        url: "https://curia.europa.eu/",
        description: "EU law, judgments, opinions and case-law search.",
        aliases: ["curia", "cjeu", "eu law", "european case law", "judgments"]
      },
      {
        title: "Law Society of Ireland",
        url: "https://www.lawsociety.ie/",
        description: "Professional guidance, practice notes, training, CPD and solicitor resources.",
        aliases: ["law society", "cpd", "practice notes", "professional guidance"]
      }
    ]
  },
  {
    title: "Revenue & Tax",
    links: [
      {
        title: "Revenue Commissioners",
        url: "https://www.revenue.ie/",
        description: "Tax, stamp duty, CAT, CGT and Revenue practice information.",
        aliases: ["revenue", "stamp duty", "tax", "cat", "cgt", "ros"]
      },
      {
        title: "Companies Registration Office",
        url: "https://www.cro.ie/",
        description: "Irish company information searches, filings and company registration details.",
        aliases: ["cro", "companies house", "company search", "company filings"]
      }
    ]
  },
  {
    title: "Compliance",
    links: [
      {
        title: "Central Bank of Ireland",
        url: "https://www.centralbank.ie/",
        description: "AML, financial regulation, regulated entities and supervisory guidance.",
        aliases: ["central bank", "aml", "financial regulation", "regulated entities"]
      },
      {
        title: "Data Protection Commission",
        url: "https://www.dataprotection.ie/",
        description: "GDPR guidance, data protection decisions, forms and compliance resources.",
        aliases: ["data protection", "dpc", "gdpr", "privacy", "compliance"]
      }
    ]
  },
  {
    title: "Conveyancing Specific",
    links: [
      {
        title: "Property Registration Services",
        url: "https://tailte.ie/services/property-registration/",
        description: "Tailte Eireann property registration services, including Land Register and Registry of Deeds information.",
        aliases: ["tailte", "property registration authority", "pra", "land register", "registry of deeds"]
      },
      {
        title: "Local Authority Planning Portals",
        url: "https://www.myplan.ie/",
        description: "National planning search starting point, with local authority planning information by area.",
        aliases: ["planning", "myplan", "planning search", "local authority", "planning portal"]
      }
    ]
  }
];

export function displayResourceUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
