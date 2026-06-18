import { formatDisplayDate } from "@/lib/dates";
import { getFirmName, getFirmSolicitorsName, getSolicitorName } from "@/lib/personalisation";
import { mergeSettings } from "@/lib/settings";
import { getMatterReferenceLine } from "@/lib/stages";
import type {
  Client,
  CustomLetterTemplate,
  Letter,
  Matter,
  Settings,
  WordTemplate
} from "@/lib/types";

export type TemplateVariables = Record<string, string>;

type LetterDefinition = {
  id: string;
  title: string;
  recipientName: (matter: Matter, client: Client) => string;
  recipientAddress: (matter: Matter, client: Client) => string;
  subject: (matter: Matter) => string;
  body: (matter: Matter, client: Client, settings: Settings) => string[];
};

type GetLettersOptions = {
  globalTemplates?: Record<string, WordTemplate>;
  customLetterTemplates?: CustomLetterTemplate[];
};

export type LetterCatalogItem = {
  id: string;
  title: string;
  matterType: Matter["type"];
  isCustomLetterType: boolean;
  templateBody?: string;
};

function clean(value?: string) {
  return value?.trim() || "";
}

function optional(value: string, fallback: string) {
  return clean(value) || fallback;
}

function euroLabel(value: string) {
  return clean(value) || "the agreed sale price";
}

export const placeholderGuide: Array<{ placeholder: string; description: string }> = [
  { placeholder: "{{client_name}}", description: "Client full name" },
  { placeholder: "{{client_address}}", description: "Client postal address" },
  { placeholder: "{{client_phone}}", description: "Client phone number" },
  { placeholder: "{{client_email}}", description: "Client email address" },
  { placeholder: "{{file_reference}}", description: "Matter file reference" },
  { placeholder: "{{today_date}}", description: "Current date" },
  { placeholder: "{{firm_name}}", description: "Firm name from Settings" },
  { placeholder: "{{firm_address}}", description: "Firm address from Settings" },
  { placeholder: "{{firm_phone}}", description: "Firm phone from Settings" },
  { placeholder: "{{firm_email}}", description: "Firm email from Settings" },
  { placeholder: "{{firm_website}}", description: "Firm website from Settings" },
  { placeholder: "{{law_society_number}}", description: "Law Society registration number" },
  { placeholder: "{{vat_number}}", description: "VAT number" },
  { placeholder: "{{solicitor_name}}", description: "Solicitor name from Settings" },
  { placeholder: "{{solicitor_title}}", description: "Solicitor title from Settings" },
  { placeholder: "{{matter_description}}", description: "Short matter description" },
  { placeholder: "{{property_address}}", description: "Property address for conveyancing matters" },
  { placeholder: "{{sale_price}}", description: "Agreed sale price" },
  { placeholder: "{{purchase_price}}", description: "Agreed purchase price" },
  { placeholder: "{{buyer_name}}", description: "Buyer name on a sale matter" },
  { placeholder: "{{buyer_solicitor_name}}", description: "Buyer solicitor name" },
  { placeholder: "{{buyer_solicitor_address}}", description: "Buyer solicitor address" },
  { placeholder: "{{auctioneer_name}}", description: "Auctioneer name" },
  { placeholder: "{{mortgage_holder}}", description: "Mortgage holder for a sale" },
  { placeholder: "{{vendor_name}}", description: "Vendor name on a purchase matter" },
  { placeholder: "{{vendor_solicitor_name}}", description: "Vendor solicitor name" },
  { placeholder: "{{vendor_solicitor_address}}", description: "Vendor solicitor address" },
  { placeholder: "{{mortgage_lender}}", description: "Mortgage lender on a purchase" },
  { placeholder: "{{closing_date}}", description: "Expected or agreed closing date" },
  { placeholder: "{{opponent_name}}", description: "Opponent name for litigation" },
  { placeholder: "{{opponent_address}}", description: "Opponent address" },
  { placeholder: "{{opponent_solicitor}}", description: "Opponent solicitor" },
  { placeholder: "{{dispute_type}}", description: "Litigation dispute type" },
  { placeholder: "{{dispute_description}}", description: "Litigation dispute description" },
  { placeholder: "{{claim_value}}", description: "Claim value" },
  { placeholder: "{{limitation_date}}", description: "Limitation date" },
  { placeholder: "{{third_party_name}}", description: "Third party name for ad hoc matters" },
  { placeholder: "{{third_party_address}}", description: "Third party address for ad hoc matters" }
];

export function makeLetterVariables(
  matter: Matter,
  client: Client,
  settings: Settings
): TemplateVariables {
  const common: TemplateVariables = {
    client_name: client.fullName,
    client_address: client.address,
    client_phone: client.phone,
    client_email: client.email,
    file_reference: matter.fileReference,
    today_date: formatDisplayDate(new Date().toISOString()),
    firm_name: getFirmName(settings),
    firm_address: settings.firmAddress,
    firm_phone: settings.firmPhone,
    firm_email: settings.firmEmail,
    firm_website: settings.firmWebsite,
    law_society_number: settings.lawSocietyNumber,
    vat_number: settings.vatNumber,
    solicitor_name: getSolicitorName(settings) || "your solicitor",
    solicitor_title: settings.solicitorTitle,
    matter_description: getMatterReferenceLine(matter)
  };

  if (matter.type === "conveyancing") {
    return {
      ...common,
      property_address: matter.fields.propertyAddress,
      sale_price: matter.fields.salePrice,
      buyer_name: matter.fields.buyerName,
      buyer_solicitor_name: matter.fields.buyerSolicitorName,
      buyer_solicitor_address: matter.fields.buyerSolicitorAddress,
      auctioneer_name: matter.fields.auctioneerName,
      mortgage_holder: matter.fields.mortgageHolder,
      closing_date: formatDisplayDate(matter.fields.closingDate)
    };
  }

  if (matter.type === "purchase") {
    return {
      ...common,
      property_address: matter.fields.propertyAddress,
      purchase_price: matter.fields.purchasePrice,
      vendor_name: matter.fields.vendorName,
      vendor_solicitor_name: matter.fields.vendorSolicitorName,
      vendor_solicitor_address: matter.fields.vendorSolicitorAddress,
      mortgage_lender: matter.fields.mortgageLender,
      closing_date: formatDisplayDate(matter.fields.closingDate)
    };
  }

  if (matter.type === "litigation") {
    return {
      ...common,
      opponent_name: matter.fields.opponentName,
      opponent_address: matter.fields.opponentAddress,
      opponent_solicitor: matter.fields.opponentSolicitor,
      dispute_type: matter.fields.disputeType,
      dispute_description: matter.fields.disputeDescription,
      claim_value: matter.fields.claimValue,
      limitation_date: formatDisplayDate(matter.fields.limitationDate)
    };
  }

  return {
    ...common,
    third_party_name: matter.fields.thirdPartyName,
    third_party_address: matter.fields.thirdPartyAddress
  };
}

export function replacePlaceholders(template: string, variables: TemplateVariables) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => {
    return variables[key] ?? "";
  });
}

function shell(
  settings: Settings,
  recipientName: string,
  recipientAddress: string,
  subject: string,
  body: string[]
) {
  const header = [
    getFirmName(settings),
    settings.firmAddress,
    settings.firmPhone ? `Tel: ${settings.firmPhone}` : "",
    settings.firmEmail ? `Email: ${settings.firmEmail}` : "",
    settings.firmWebsite ? `Web: ${settings.firmWebsite}` : "",
    settings.lawSocietyNumber ? `Law Society No: ${settings.lawSocietyNumber}` : "",
    settings.vatNumber ? `VAT No: ${settings.vatNumber}` : ""
  ].filter(Boolean);
  const bodyText = [
    body.join("\n\n"),
    settings.letterDefaults.closingLine
  ].filter(Boolean).join("\n\n");
  const solicitorSignoffName = [
    settings.solicitorTitle,
    getSolicitorName(settings) || "Your solicitor"
  ].filter(Boolean).join(" ");

  return [
    ...header,
    formatDisplayDate(new Date().toISOString()),
    "",
    recipientName,
    recipientAddress,
    "",
    `Re: ${subject}`,
    "",
    `Dear ${recipientName ? recipientName.split("\n")[0] : "Sir/Madam"},`,
    "",
    bodyText,
    "",
    settings.letterDefaults.signOffText || "Yours sincerely",
    "",
    solicitorSignoffName,
    getFirmSolicitorsName(settings)
  ].join("\n");
}

const conveyancingLetters: LetterDefinition[] = [
  {
    id: "conveyancing-client-care",
    title: "Client Care Letter",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "conveyancing"
        ? `${matter.fileReference} — Sale of ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter, _client, settings) => {
      if (matter.type !== "conveyancing") return [];
      return [
        `We confirm receipt of your instructions to act on your behalf in the sale of ${matter.fields.propertyAddress}. We will prepare the contract for sale, assemble the title documentation, deal with pre-contract enquiries, attend to exchange of contracts, complete the sale and account to you for the net proceeds.`,
        `Our professional fee and outlays will be confirmed separately and kept under review if the transaction becomes more complex than presently anticipated. We will keep you informed of material developments and will not incur unusual outlay without your authority.`,
        `The immediate next steps are to complete our client opening requirements, obtain the title documents, liaise with ${optional(matter.fields.auctioneerName, "the auctioneer")} and issue the contract pack to the purchaser's solicitor. Please contact ${settings.solicitorName} if any details in this letter require correction.`
      ];
    }
  },
  {
    id: "conveyancing-aml-request",
    title: "AML Request Letter",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "conveyancing"
        ? `${matter.fileReference} — AML requirements for ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "conveyancing") return [];
      return [
        `Before we can progress the sale of ${matter.fields.propertyAddress}, we are required to complete client due diligence in accordance with Irish Anti-Money Laundering obligations.`,
        "Please provide certified photographic identification, recent proof of address and source of funds documentation. Certification should be carried out by a solicitor, accountant, Garda, financial institution or other acceptable professional.",
        "Once received, we will review the documents and confirm whether anything further is required. We cannot exchange contracts or complete the transaction until our compliance requirements have been satisfied."
      ];
    }
  },
  {
    id: "conveyancing-title-deeds-bank",
    title: "Letter Requesting Title Deeds From Bank",
    recipientName: (matter) =>
      matter.type === "conveyancing" ? optional(matter.fields.mortgageHolder, "Mortgage Holder") : "",
    recipientAddress: (matter) =>
      matter.type === "conveyancing" ? optional(matter.fields.mortgageHolder, "Mortgage Department") : "",
    subject: (matter) =>
      matter.type === "conveyancing"
        ? `${matter.fileReference} — Title deeds for ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter, client) => {
      if (matter.type !== "conveyancing") return [];
      return [
        `We act for ${client.fullName} in the sale of ${matter.fields.propertyAddress}. We understand that you hold the title deeds and related security documentation in respect of the property.`,
        "Please release the title deeds to us under Accountable Trust Receipt as soon as possible, together with details of any requirements attaching to their release.",
        `The matter is progressing toward sale and early receipt of the title documentation is required so that the contract pack may issue without delay.`
      ];
    }
  },
  {
    id: "conveyancing-contract-pack",
    title: "Letter To Buyer's Solicitor Issuing Contract Pack",
    recipientName: (matter) =>
      matter.type === "conveyancing" ? optional(matter.fields.buyerSolicitorName, "Purchaser's Solicitor") : "",
    recipientAddress: (matter) =>
      matter.type === "conveyancing" ? matter.fields.buyerSolicitorAddress : "",
    subject: (matter) =>
      matter.type === "conveyancing"
        ? `${matter.fileReference} — Sale of ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "conveyancing") return [];
      return [
        `We act for the vendor in the sale of ${matter.fields.propertyAddress} to ${matter.fields.buyerName} for ${euroLabel(matter.fields.salePrice)}.`,
        "We enclose the contract for sale together with the available title documents, planning documentation and supporting replies. Please review the pack and raise any pre-contract enquiries as soon as practicable.",
        `Subject to satisfactory resolution of enquiries and execution by your client, we will arrange exchange of contracts and progress the matter toward the proposed closing date of ${formatDisplayDate(matter.fields.closingDate)}.`
      ];
    }
  },
  {
    id: "conveyancing-contracts-signature",
    title: "Letter To Client Enclosing Contracts For Signature",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "conveyancing"
        ? `${matter.fileReference} — Contract for sale of ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "conveyancing") return [];
      return [
        `We enclose the contract for sale relating to ${matter.fields.propertyAddress}. The contract records the agreed sale price of ${euroLabel(matter.fields.salePrice)} and the principal terms agreed with the purchaser.`,
        "Please read the contract carefully, sign where indicated and return the signed contract to us at your earliest convenience. If you have any query about the terms, please contact us before signing.",
        "Once the purchaser has signed and all pre-contract matters are resolved, we will attend to exchange of contracts and update you immediately."
      ];
    }
  },
  {
    id: "conveyancing-contracts-exchanged",
    title: "Letter Confirming Contracts Exchanged",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "conveyancing"
        ? `${matter.fileReference} — Contracts exchanged for ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "conveyancing") return [];
      return [
        `We are pleased to confirm that contracts have now been exchanged for the sale of ${matter.fields.propertyAddress} at ${euroLabel(matter.fields.salePrice)}.`,
        `The agreed closing date is ${formatDisplayDate(matter.fields.closingDate)}. We will now deal with the pre-closing requirements, obtain any required redemption figure and prepare the closing documentation.`,
        "Please ensure that arrangements for keys, vacant possession and any practical handover matters are coordinated with the auctioneer in good time before closing."
      ];
    }
  },
  {
    id: "conveyancing-redemption-figure",
    title: "Letter Requesting Mortgage Redemption Figure",
    recipientName: (matter) =>
      matter.type === "conveyancing" ? optional(matter.fields.mortgageHolder, "Mortgage Holder") : "",
    recipientAddress: (matter) =>
      matter.type === "conveyancing" ? optional(matter.fields.mortgageHolder, "Mortgage Department") : "",
    subject: (matter) =>
      matter.type === "conveyancing"
        ? `${matter.fileReference} — Redemption figure for ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter, client) => {
      if (matter.type !== "conveyancing") return [];
      return [
        `We act for ${client.fullName} in the sale of ${matter.fields.propertyAddress}. The transaction is due to close on ${formatDisplayDate(matter.fields.closingDate)}.`,
        "Please furnish an up-to-date mortgage redemption figure calculated to the proposed closing date, together with any daily interest figure and discharge requirements.",
        "We will attend to redemption from the sale proceeds on closing and will provide any undertaking reasonably required in the usual form."
      ];
    }
  },
  {
    id: "conveyancing-closing-statement",
    title: "Closing Statement Letter",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "conveyancing"
        ? `${matter.fileReference} — Closing statement for ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "conveyancing") return [];
      return [
        `We enclose the closing financial statement for the sale of ${matter.fields.propertyAddress}. The statement shows the gross sale price of ${euroLabel(matter.fields.salePrice)}, mortgage redemption, professional fees, outlays and the estimated net proceeds due to you.`,
        "The mortgage redemption figure will be discharged directly from the sale proceeds on completion. Any final adjustment for apportionments, service charges or additional outlays will be reflected before funds are released.",
        "Please review the statement and contact us promptly if you require any clarification before closing."
      ];
    }
  },
  {
    id: "conveyancing-sale-completed",
    title: "Letter Confirming Sale Completed",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "conveyancing"
        ? `${matter.fileReference} — Sale completed for ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "conveyancing") return [];
      return [
        `We confirm that the sale of ${matter.fields.propertyAddress} has now completed and the purchase monies have been received.`,
        `We have attended to redemption of the mortgage with ${optional(matter.fields.mortgageHolder, "the mortgage holder")} where applicable and will arrange release of the net proceeds to you in accordance with your instructions.`,
        "Thank you for your cooperation throughout the transaction. We will issue any remaining completion documentation and our final account shortly."
      ];
    }
  },
  {
    id: "conveyancing-file-closure",
    title: "File Closure Letter",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "conveyancing"
        ? `${matter.fileReference} — File closure for ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "conveyancing") return [];
      return [
        `We confirm that our file in connection with the sale of ${matter.fields.propertyAddress} is now closed.`,
        "We enclose our final invoice and any remaining papers requiring return. Please retain this correspondence with your records.",
        "Thank you for instructing us in this matter. We would be pleased to assist you again should you require legal advice in the future."
      ];
    }
  }
];

const purchaseLetters: LetterDefinition[] = [
  {
    id: "purchase-client-care",
    title: "Client Care Letter",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "purchase"
        ? `${matter.fileReference} — Purchase of ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter, _client, settings) => {
      if (matter.type !== "purchase") return [];
      return [
        `We confirm receipt of your instructions to act on your behalf in the purchase of ${matter.fields.propertyAddress}. We will review the contract and title documents, raise pre-contract enquiries, advise you on the mortgage offer, attend to exchange of contracts, draw down loan funds and complete the purchase.`,
        `Our professional fee and outlays will be confirmed separately and kept under review if the transaction becomes more complex than presently anticipated. We will keep you informed of material developments and will not incur unusual outlay without your authority.`,
        `The immediate next steps are to complete our client opening requirements, review the contract pack when received from ${optional(matter.fields.vendorSolicitorName, "the vendor's solicitor")} and liaise with ${optional(matter.fields.mortgageLender, "your lender")} in relation to mortgage conditions. Please contact ${settings.solicitorName} if any details require correction.`
      ];
    }
  },
  {
    id: "purchase-aml-request",
    title: "AML Request Letter",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "purchase"
        ? `${matter.fileReference} — AML requirements for ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "purchase") return [];
      return [
        `Before we can progress the purchase of ${matter.fields.propertyAddress}, we are required to complete client due diligence in accordance with Irish Anti-Money Laundering obligations.`,
        "Please provide certified photographic identification, recent proof of address and source of funds documentation for the deposit, balance funds and any contribution outside the mortgage advance.",
        "Once received, we will review the documents and confirm whether anything further is required. We cannot exchange contracts or complete the purchase until our compliance requirements have been satisfied."
      ];
    }
  },
  {
    id: "purchase-mortgage-offer-review",
    title: "Mortgage Offer Review Letter",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "purchase"
        ? `${matter.fileReference} — Mortgage offer for ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "purchase") return [];
      return [
        `We have reviewed the mortgage offer issued by ${optional(matter.fields.mortgageLender, "your lender")} in connection with your proposed purchase of ${matter.fields.propertyAddress}.`,
        "The offer appears to be conditional on the usual matters, including satisfactory title, insurance, valuation and compliance with any special conditions set out in the loan documentation. You should read the financial terms carefully, including the amount borrowed, interest rate, repayment term and any fixed-rate conditions.",
        "Please let us know immediately if any term does not match your understanding. We will continue to deal with the lender's legal requirements and will not request funds until the purchase is ready to close."
      ];
    }
  },
  {
    id: "purchase-pre-contract-enquiries",
    title: "Pre-Contract Enquiries To Vendor's Solicitor",
    recipientName: (matter) =>
      matter.type === "purchase" ? optional(matter.fields.vendorSolicitorName, "Vendor's Solicitor") : "",
    recipientAddress: (matter) =>
      matter.type === "purchase" ? matter.fields.vendorSolicitorAddress : "",
    subject: (matter) =>
      matter.type === "purchase"
        ? `${matter.fileReference} — Purchase of ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter, client) => {
      if (matter.type !== "purchase") return [];
      return [
        `We act for ${client.fullName}, the proposed purchaser of ${matter.fields.propertyAddress} from ${matter.fields.vendorName} for ${euroLabel(matter.fields.purchasePrice)}.`,
        "Having reviewed the contract pack and title documentation, please treat this letter as our client's pre-contract enquiries. Please furnish replies to the usual title, planning, services, boundaries, burdens, access and closing-documentation matters, together with any missing searches or copy documents.",
        `We would be obliged if you would respond promptly so that our client can consider signing contracts and progressing toward the proposed closing date of ${formatDisplayDate(matter.fields.closingDate)}.`
      ];
    }
  },
  {
    id: "purchase-contracts-signature",
    title: "Letter Enclosing Contracts For Signature",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "purchase"
        ? `${matter.fileReference} — Contract for purchase of ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "purchase") return [];
      return [
        `We enclose the contract for sale for your proposed purchase of ${matter.fields.propertyAddress}. The contract records the agreed purchase price of ${euroLabel(matter.fields.purchasePrice)} and the principal terms agreed with the vendor.`,
        "Please read the contract carefully, sign where indicated and return the signed contract to us. By signing, you are authorising us to exchange contracts once the remaining pre-contract matters and lender requirements are satisfactorily resolved.",
        "Please do not make any closing or moving arrangements until we confirm that contracts have been exchanged and a closing date is binding."
      ];
    }
  },
  {
    id: "purchase-contracts-exchanged",
    title: "Letter Confirming Contracts Exchanged",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "purchase"
        ? `${matter.fileReference} — Contracts exchanged for ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "purchase") return [];
      return [
        `We confirm that contracts have now been exchanged for your purchase of ${matter.fields.propertyAddress} at ${euroLabel(matter.fields.purchasePrice)}.`,
        `The agreed closing date is ${formatDisplayDate(matter.fields.closingDate)}. We will now deal with requisitions on title, closing searches, lender requirements and preparation of the balance funds required from you.`,
        "Please ensure that your insurance, mortgage and practical moving arrangements are in hand, but do not release funds or complete any handover arrangements except through this office."
      ];
    }
  },
  {
    id: "purchase-requisitions-title",
    title: "Requisitions On Title",
    recipientName: (matter) =>
      matter.type === "purchase" ? optional(matter.fields.vendorSolicitorName, "Vendor's Solicitor") : "",
    recipientAddress: (matter) =>
      matter.type === "purchase" ? matter.fields.vendorSolicitorAddress : "",
    subject: (matter) =>
      matter.type === "purchase"
        ? `${matter.fileReference} — Requisitions on title for ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "purchase") return [];
      return [
        `We refer to the contract for sale in respect of ${matter.fields.propertyAddress}. Please find enclosed our requisitions on title.`,
        "Please furnish full replies, together with all completion documents, closing searches, declarations, consents, releases and undertakings required to complete with good marketable title.",
        `As the proposed closing date is ${formatDisplayDate(matter.fields.closingDate)}, we would be obliged if replies and draft closing documentation could issue as soon as possible.`
      ];
    }
  },
  {
    id: "purchase-lender-funds",
    title: "Letter To Lender Requesting Funds",
    recipientName: (matter) =>
      matter.type === "purchase" ? optional(matter.fields.mortgageLender, "Mortgage Lender") : "",
    recipientAddress: (matter) =>
      matter.type === "purchase" ? optional(matter.fields.mortgageLender, "Mortgage Department") : "",
    subject: (matter) =>
      matter.type === "purchase"
        ? `${matter.fileReference} — Loan funds for ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter, client) => {
      if (matter.type !== "purchase") return [];
      return [
        `We act for ${client.fullName} in the purchase of ${matter.fields.propertyAddress}. The transaction is due to close on ${formatDisplayDate(matter.fields.closingDate)}.`,
        "Please arrange drawdown of the approved mortgage funds to our client account in accordance with your usual requirements and the certificate of title submitted by this office.",
        "We confirm that funds will be held and applied strictly in accordance with your mortgage instructions and the usual solicitor's undertakings."
      ];
    }
  },
  {
    id: "purchase-closing-statement",
    title: "Closing Statement Letter",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "purchase"
        ? `${matter.fileReference} — Closing statement for ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "purchase") return [];
      return [
        `We enclose the closing financial statement for your purchase of ${matter.fields.propertyAddress}. The statement shows the purchase price of ${euroLabel(matter.fields.purchasePrice)}, mortgage advance, deposit, stamp duty, registration fees, professional fees, outlays and the balance required from you to complete.`,
        "Please transfer the balance funds to our client account in cleared funds in good time before closing. We will not complete until mortgage funds and your balance funds have both been received and all title requirements are satisfied.",
        "Please review the statement and contact us promptly if you require any clarification before closing."
      ];
    }
  },
  {
    id: "purchase-completed",
    title: "Letter Confirming Purchase Completed",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "purchase"
        ? `${matter.fileReference} — Purchase completed for ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "purchase") return [];
      return [
        `We are pleased to confirm that your purchase of ${matter.fields.propertyAddress} has now completed.`,
        "The purchase monies have been released to the vendor's solicitor and arrangements can now be made for keys and possession in the usual way. We will attend to stamping, registration and any post-completion requirements with your lender.",
        "We will update you when registration has completed and will provide copies of the relevant title documentation for your records."
      ];
    }
  },
  {
    id: "purchase-file-closure",
    title: "File Closure Letter",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "purchase"
        ? `${matter.fileReference} — File closure for ${matter.fields.propertyAddress}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "purchase") return [];
      return [
        `We confirm that our file in connection with your purchase of ${matter.fields.propertyAddress} is now closed.`,
        "Registration and lender post-completion requirements have been attended to, and we enclose our final invoice together with any remaining papers for your records.",
        "Thank you for instructing us in this matter. We wish you well in your new property and would be pleased to assist you again should you require legal advice in the future."
      ];
    }
  }
];

const litigationLetters: LetterDefinition[] = [
  {
    id: "litigation-client-care",
    title: "Client Care Letter",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "litigation"
        ? `${matter.fileReference} — ${matter.fields.disputeType} against ${matter.fields.opponentName}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "litigation") return [];
      return [
        `We confirm receipt of your instructions to act in your ${matter.fields.disputeType.toLowerCase()} against ${matter.fields.opponentName}. We understand the dispute to concern ${matter.fields.disputeDescription}.`,
        "Our initial work will include reviewing your documentation, advising on merits and strategy, corresponding with the other side and taking steps to protect your position before any proceedings issue.",
        "We will discuss fees, outlays and litigation risk with you as the matter develops. Court proceedings can involve cost exposure and uncertainty, and no step will be taken without your instructions."
      ];
    }
  },
  {
    id: "litigation-aml-request",
    title: "AML Request Letter",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "litigation"
        ? `${matter.fileReference} — Client due diligence`
        : matter.fileReference,
    body: () => [
      "Before we can progress your matter, we are required to complete client due diligence under Irish Anti-Money Laundering obligations.",
      "Please provide certified photographic identification and recent proof of address. Depending on the nature of the matter, we may also require source of funds documentation.",
      "Once we have reviewed the documents, we will confirm whether any further compliance information is required."
    ]
  },
  {
    id: "litigation-advice-merits",
    title: "Advice Letter On Merits",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "litigation"
        ? `${matter.fileReference} — Advice on merits`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "litigation") return [];
      return [
        `We have considered your instructions concerning ${matter.fields.disputeDescription}. On the information presently available, your position appears arguable and should first be advanced through structured pre-action correspondence.`,
        `The key issues are liability, available evidence, loss and whether the opponent can realistically meet any claim. ${matter.fields.claimValue ? `The value currently identified is ${matter.fields.claimValue}.` : "The value of the claim should be clarified with supporting documentation."}`,
        "Our practical recommendation is to preserve all documents, avoid direct informal exchanges that may prejudice your case, and authorise us to issue a letter before action seeking a clear response within 14 days."
      ];
    }
  },
  {
    id: "litigation-letter-before-action",
    title: "Letter Before Action",
    recipientName: (matter) =>
      matter.type === "litigation" ? matter.fields.opponentName : "",
    recipientAddress: (matter) =>
      matter.type === "litigation" ? matter.fields.opponentAddress : "",
    subject: (matter) =>
      matter.type === "litigation"
        ? `${matter.fileReference} — Letter before action`
        : matter.fileReference,
    body: (matter, client) => {
      if (matter.type !== "litigation") return [];
      return [
        `We act for ${client.fullName}. This letter is sent in relation to ${matter.fields.disputeDescription}.`,
        `Our client's position is that you are liable in respect of this ${matter.fields.disputeType.toLowerCase()}. ${matter.fields.claimValue ? `Our client presently values the claim at ${matter.fields.claimValue}.` : "Our client reserves the right to particularise loss and damage further."}`,
        "Unless we receive a satisfactory substantive response within 14 days of the date of this letter, our instructions are to advise our client in relation to issuing court proceedings without further notice to you."
      ];
    }
  },
  {
    id: "litigation-without-prejudice",
    title: "Without Prejudice Settlement Letter",
    recipientName: (matter) =>
      matter.type === "litigation"
        ? optional(matter.fields.opponentSolicitor, "Opponent Solicitor")
        : "",
    recipientAddress: (matter) =>
      matter.type === "litigation" ? optional(matter.fields.opponentSolicitor, "Address unknown") : "",
    subject: (matter) =>
      matter.type === "litigation"
        ? `${matter.fileReference} — Without prejudice settlement proposal`
        : matter.fileReference,
    body: (matter, client) => {
      if (matter.type !== "litigation") return [];
      return [
        `We act for ${client.fullName}. This letter is written without prejudice and save as to costs in an effort to resolve the dispute concerning ${matter.fields.disputeDescription}.`,
        "Our client remains confident in the merits of the claim but is willing to consider a practical settlement that avoids the cost, delay and uncertainty of litigation.",
        "Please confirm whether your client is prepared to engage in settlement discussions or mediation. We reserve all of our client's rights should a satisfactory resolution not be achieved."
      ];
    }
  },
  {
    id: "litigation-opponent-response",
    title: "Letter To Client On Opponent Response",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "litigation"
        ? `${matter.fileReference} — Opponent response`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "litigation") return [];
      return [
        `We write to update you on the response received in relation to your dispute with ${matter.fields.opponentName}.`,
        "The response does not resolve the matter in full. We recommend considering whether further clarification, settlement engagement or the issue of proceedings is now the most proportionate next step.",
        "Please review the enclosed correspondence and let us have your instructions. We will not take any further step without your authority."
      ];
    }
  },
  {
    id: "litigation-issuing-proceedings",
    title: "Letter Issuing Proceedings",
    recipientName: (matter) =>
      matter.type === "litigation"
        ? optional(matter.fields.opponentSolicitor, "Opponent Solicitor")
        : "",
    recipientAddress: (matter) =>
      matter.type === "litigation" ? optional(matter.fields.opponentSolicitor, "Address unknown") : "",
    subject: (matter) =>
      matter.type === "litigation"
        ? `${matter.fileReference} — Proceedings issued`
        : matter.fileReference,
    body: (matter, client) => {
      if (matter.type !== "litigation") return [];
      return [
        `We act for ${client.fullName}. We enclose by way of service or notification the issued proceedings in respect of ${matter.fields.disputeDescription}.`,
        "Please confirm that you have instructions to accept service on behalf of your client. If not, please notify us immediately so that formal service can be arranged.",
        "Our client's rights are fully reserved, including the right to seek costs and any further relief available."
      ];
    }
  },
  {
    id: "litigation-file-closure",
    title: "File Closure Letter",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "litigation"
        ? `${matter.fileReference} — File closure`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "litigation") return [];
      return [
        `We confirm that your matter concerning ${matter.fields.disputeDescription} has now resolved and our file is being closed.`,
        "We enclose our final invoice and any remaining documents for your records. Please retain all settlement, court and correspondence papers safely.",
        "Thank you for your instructions. If any issue arises in relation to implementation of the resolution, please contact us promptly."
      ];
    }
  }
];

const adHocLetters: LetterDefinition[] = [
  {
    id: "adhoc-client-care",
    title: "Client Care Letter",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "adhoc"
        ? `${matter.fileReference} — ${matter.fields.matterDescription}`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "adhoc") return [];
      return [
        `We confirm receipt of your instructions concerning ${matter.fields.matterDescription}. We will review the relevant facts, advise on the applicable Irish law and correspond with any third party as required.`,
        "Our initial work will include opening the file, completing compliance checks, considering your documents and preparing any necessary correspondence.",
        "We will keep you advised of progress and will seek your instructions before taking any material step or incurring unusual outlay."
      ];
    }
  },
  {
    id: "adhoc-aml-request",
    title: "AML Request Letter",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "adhoc"
        ? `${matter.fileReference} — Client due diligence`
        : matter.fileReference,
    body: () => [
      "Before we can progress your matter, we are required to complete client due diligence under Irish Anti-Money Laundering obligations.",
      "Please provide certified photographic identification, recent proof of address and any source of funds documentation relevant to the matter.",
      "Once received, we will review the documentation and confirm whether anything further is required."
    ]
  },
  {
    id: "adhoc-third-party",
    title: "Letter To Third Party",
    recipientName: (matter) =>
      matter.type === "adhoc" ? optional(matter.fields.thirdPartyName, "Third Party") : "",
    recipientAddress: (matter) =>
      matter.type === "adhoc" ? matter.fields.thirdPartyAddress : "",
    subject: (matter) =>
      matter.type === "adhoc"
        ? `${matter.fileReference} — ${matter.fields.matterDescription}`
        : matter.fileReference,
    body: (matter, client) => {
      if (matter.type !== "adhoc") return [];
      return [
        `We act for ${client.fullName} in relation to ${matter.fields.matterDescription}.`,
        "We are instructed to write to you to set out our client's position and to request that the matter be addressed promptly and constructively.",
        "Please provide your substantive response within 14 days of the date of this letter. In the meantime, our client's rights and remedies are fully reserved."
      ];
    }
  },
  {
    id: "adhoc-file-closure",
    title: "File Closure Letter",
    recipientName: (_matter, client) => client.fullName,
    recipientAddress: (_matter, client) => client.address,
    subject: (matter) =>
      matter.type === "adhoc"
        ? `${matter.fileReference} — File closure`
        : matter.fileReference,
    body: (matter) => {
      if (matter.type !== "adhoc") return [];
      return [
        `We confirm that our work concerning ${matter.fields.matterDescription} has concluded and our file is now closed.`,
        "We enclose our final invoice and any remaining papers for your records.",
        "Thank you for your instructions. Please contact us if you require any further assistance."
      ];
    }
  }
];

function definitionsFor(matter: Matter) {
  if (matter.type === "conveyancing") return conveyancingLetters;
  if (matter.type === "purchase") return purchaseLetters;
  if (matter.type === "litigation") return litigationLetters;
  return adHocLetters;
}

export function getLetterCatalog(
  customLetterTemplates: CustomLetterTemplate[] = []
): LetterCatalogItem[] {
  const builtInCatalog: LetterCatalogItem[] = [
    ...conveyancingLetters.map((definition) => ({
      id: definition.id,
      title: definition.title,
      matterType: "conveyancing" as const,
      isCustomLetterType: false
    })),
    ...purchaseLetters.map((definition) => ({
      id: definition.id,
      title: definition.title,
      matterType: "purchase" as const,
      isCustomLetterType: false
    })),
    ...litigationLetters.map((definition) => ({
      id: definition.id,
      title: definition.title,
      matterType: "litigation" as const,
      isCustomLetterType: false
    })),
    ...adHocLetters.map((definition) => ({
      id: definition.id,
      title: definition.title,
      matterType: "adhoc" as const,
      isCustomLetterType: false
    }))
  ];

  const customCatalog = customLetterTemplates.map<LetterCatalogItem>((template) => ({
    id: template.id,
    title: template.title,
    matterType: template.matterType,
    isCustomLetterType: true,
    templateBody: template.body
  }));

  return [...builtInCatalog, ...customCatalog];
}

export function getLetters(
  matter: Matter,
  client: Client,
  settings: Settings,
  options: GetLettersOptions = {}
): Letter[] {
  settings = mergeSettings(settings);
  const variables = makeLetterVariables(matter, client, settings);
  const defaultLetters = definitionsFor(matter).map((definition) => {
    const recipientName = definition.recipientName(matter, client);
    const recipientAddress = definition.recipientAddress(matter, client);
    const customTemplate = matter.customTemplates[definition.id] ?? options.globalTemplates?.[definition.id];
    const text = customTemplate
      ? replacePlaceholders(customTemplate.extractedText, variables)
      : shell(
          settings,
          recipientName,
          recipientAddress,
          definition.subject(matter),
          definition.body(matter, client, settings)
        );

    return {
      id: definition.id,
      title: definition.title,
      recipientName,
      recipientAddress,
      text,
      isCustom: Boolean(customTemplate)
    };
  });

  const customLetters = (options.customLetterTemplates ?? [])
    .filter((template) => template.matterType === matter.type)
    .map<Letter>((template) => {
      const templateBody =
        matter.customTemplates[template.id]?.extractedText ??
        options.globalTemplates?.[template.id]?.extractedText ??
        template.body;
      const body = replacePlaceholders(templateBody, variables);
      return {
        id: template.id,
        title: template.title,
        recipientName: client.fullName,
        recipientAddress: client.address,
        text: shell(
          settings,
          client.fullName,
          client.address,
          `${matter.fileReference} — ${template.title}`,
          [body]
        ),
        isCustom: true
      };
    });

  return [...defaultLetters, ...customLetters];
}

export function getAmlStatus(aml: { photoIdReceived: boolean; proofOfAddressReceived: boolean; sourceOfFundsReceived: boolean; verified: boolean }) {
  if (aml.verified) return "Verified";
  if (aml.photoIdReceived && aml.proofOfAddressReceived && aml.sourceOfFundsReceived) {
    return "Pending Review";
  }
  return "Incomplete";
}
